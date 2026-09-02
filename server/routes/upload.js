const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const FormData = require('form-data');
const fs = require('fs');

const prisma = require('../prismaClient');
const auth = require('../middleware/auth');
const { requireProjectAccess, requireRole } = require('../middleware/auth');
const ai = require('../utils/aiService');
const events = require('../utils/events');

// ── Multer config ─────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt', '.csv'];

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} is not supported. Upload a PDF, Word, text or CSV file.`), false);
    }
  },
});

/**
 * Multer rejects files inside middleware, so its errors never reached the
 * route handler's try/catch — a file over the limit returned a raw HTML 500.
 * Wrapping the middleware turns those into the JSON the client expects.
 */
function handleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File is too large. The maximum size is 50MB.' });
    }
    return res.status(400).json({ error: err.message || 'Upload failed.' });
  });
}

// ── Background analysis ───────────────────────────────────────────────────────
// filePath is captured in the closure: by the time setImmediate fires the file
// is already on disk, so a fresh ReadStream is safe.
async function triggerAnalysis(docId, filePath, originalName, projectId, userId) {
  try {
    await prisma.document.update({
      where: { id: docId },
      data: { status: 'Processing' },
    });

    // ── Retry wrapper: the AI service on Render free tier sleeps after 15 min
    // of inactivity. The first request after sleep returns 502 while the
    // container cold-boots. We retry up to 3 times with increasing delays
    // to give it time to wake up.
    let initResponse = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // FormData streams can only be consumed once, so rebuild on each retry
        const retryForm = new FormData();
        retryForm.append('file', fs.createReadStream(filePath), originalName);
        retryForm.append('projectId', projectId);
        retryForm.append('documentId', docId);

        initResponse = await ai.post('/analyze', retryForm, {
          headers: retryForm.getHeaders(),
          timeout: 60000,
        });
        break; // success
      } catch (postErr) {
        const status = postErr.response?.status;
        console.warn(`POST /analyze attempt ${attempt}/3 failed (status=${status}): ${postErr.message}`);
        if (attempt === 3) throw postErr;
        // Wait longer on each retry to let the container finish booting
        await new Promise(r => setTimeout(r, attempt * 15000));
      }
    }

    const taskId = initResponse.data.task_id;
    if (!taskId) throw new Error("Failed to start AI analysis (no task_id)");

    let data = null;
    let consecutiveErrors = 0;
    for (let i = 0; i < 180; i++) { // wait up to 15 minutes
      await new Promise(r => setTimeout(r, 5000));
      try {
        const statusRes = await ai.get(`/task/${taskId}`);
        consecutiveErrors = 0; // reset on success
        if (statusRes.data.status === 'completed') {
          data = statusRes.data.result;
          break;
        } else if (statusRes.data.status === 'failed') {
          throw new Error(statusRes.data.error || 'AI processing failed internally');
        }
      } catch (pollErr) {
        // If the error was thrown by the 'failed' status check above, re-throw
        if (pollErr.message && !pollErr.response) throw pollErr;
        consecutiveErrors++;
        console.warn(`Poll /task/${taskId} error ${consecutiveErrors}: ${pollErr.message}`);
        // Allow up to 5 consecutive network errors before giving up
        if (consecutiveErrors >= 5) throw new Error('AI service unreachable after 5 consecutive poll failures');
      }
    }
    if (!data) throw new Error("Analysis timed out after 15 minutes.");

    await prisma.document.update({
      where: { id: docId },
      data: {
        status: 'Analyzed',
        analysisSource: data.analysis_source || 'groq',
        summary: data.summary || null,
        extractedText: data.extracted_text ? data.extracted_text.substring(0, 5000) : null,
        wordCount: data.word_count || 0,
        riskScore: typeof data.risk_score === 'number' ? data.risk_score : null,
        riskLevel: data.risk_level || null,
        keyInsights: Array.isArray(data.key_insights) ? data.key_insights : [],
        recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
        riskCategories: data.risk_categories || {},
        scope: data.scope || null,
        deliverables: data.deliverables || [],
        blockers: data.blockers || [],
        scheduleForecast: data.schedule_forecast || null,
        userStories: data.user_stories || [],
        riskRegister: data.risk_register || [],
        projectHealth: data.project_health || null,
        confidence: typeof data.confidence_score === 'number' ? data.confidence_score : null,

        missingDocs: data.missing_documentation || [],
        traceability: data.traceability_gaps || [],
        sprintSummary: typeof data.sprint_summary === 'object'
          ? JSON.stringify(data.sprint_summary)
          : (data.sprint_summary || null),
        meetingMinutes: data.meeting_minutes || null,
        decisions: data.decisions || [],
        actionItems: data.action_items || [],

        processingTimeMs: data.processing_time_ms || null,
        errorMessage: null,
      },
    });

    console.log(`Analyzed document ${docId}: ${data.risk_level} (score: ${data.risk_score})`);

    await events.logActivity(projectId, userId, 'document.analyzed', {
      documentId: docId,
      name: originalName,
      riskLevel: data.risk_level,
      riskScore: data.risk_score,
      healthScore: data.project_health?.score ?? null,
    });

    await events.recordHealthSnapshot(projectId, {
      health: data.project_health,
      riskScore: data.risk_score,
    });

    await events.notifyProject(projectId, {
      type: 'analysis',
      message: `Analysis finished for "${originalName}" — ${data.risk_level || 'Unknown'} risk.`,
      link: `/report/${docId}`,
    });

    // High-risk documents raise a real notification for the whole team rather
    // than only writing a console line.
    if (typeof data.risk_score === 'number' && data.risk_score >= 70) {
      const message = `Critical risk: "${originalName}" scored ${data.risk_score}/100 and needs attention.`;
      await prisma.alertLog.create({
        data: {
          documentId: docId,
          projectId,
          riskScore: data.risk_score,
          riskLevel: data.risk_level || 'High',
          alertType: 'in_app',
          message,
        },
      });
      await events.notifyProject(projectId, {
        type: 'risk',
        message,
        link: `/report/${docId}`,
      });
      await events.logActivity(projectId, userId, 'risk.critical', {
        documentId: docId,
        riskScore: data.risk_score,
      });
    }
  } catch (err) {
    const message = err.response?.data?.detail || err.message || 'Unknown error';
    console.error(`Analysis failed for document ${docId}:`, message);
    await prisma.document.update({
      where: { id: docId },
      data: { status: 'Failed', errorMessage: message },
    }).catch(e => console.error('Could not mark document as failed:', e.message));
  }
}

// ── POST /api/upload ──────────────────────────────────────────────────────────
router.post(
  '/',
  auth,
  handleUpload,
  requireProjectAccess(req => req.body.projectId),
  requireRole('pm', 'developer'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

      const projectId = req.projectId;

      const doc = await prisma.document.create({
        data: {
          projectId,
          filename: req.file.filename,
          originalName: req.file.originalname,
          fileType: req.file.mimetype,
          size: req.file.size,
          status: 'Uploaded',
        },
      });

      // Respond immediately — analysis continues in the background.
      res.status(200).json({
        message: 'File uploaded. AI analysis is starting.',
        document: doc,
      });

      await events.logActivity(projectId, req.user.id, 'document.uploaded', {
        documentId: doc.id,
        name: req.file.originalname,
        size: req.file.size,
      });

      const { path: filePath, originalname } = req.file;
      setImmediate(() => triggerAnalysis(doc.id, filePath, originalname, projectId, req.user.id));
    } catch (err) {
      console.error('Upload error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error during upload.' });
      }
    }
  }
);

// ── GET /api/upload/project/:projectId ───────────────────────────────────────
router.get(
  '/project/:projectId',
  auth,
  requireProjectAccess(req => req.params.projectId),
  async (req, res) => {
    try {
      const documents = await prisma.document.findMany({
        where: { projectId: req.params.projectId },
        orderBy: { createdAt: 'desc' },
      });

      // Drop the bulky extracted text from list responses.
      res.json(documents.map(({ extractedText, ...rest }) => rest));
    } catch (err) {
      console.error('Error fetching documents:', err);
      res.status(500).json({ error: 'Failed to fetch documents.' });
    }
  }
);

module.exports = router;
