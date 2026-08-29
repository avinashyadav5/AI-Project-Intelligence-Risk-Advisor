const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const axios = require('axios');

const FormData = require('form-data');
const fs = require('fs');
const prisma = require('../prismaClient');

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

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.txt', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not allowed`), false);
    }
  },
});

const FASTAPI_URL = process.env.FASTAPI_URL || 'http://127.0.0.1:8000';

// ── Helper: trigger AI analysis in background ─────────────────────────────────
// WHY store filePath in closure: by the time setImmediate fires, req.file is
// still in scope but the file is already on disk — safe to create a new ReadStream.
async function triggerAnalysis(docId, filePath, originalName, projectId, plan) {
  try {
    // Update status to Processing first
    await prisma.document.update({
      where: { id: docId },
      data: { status: 'Processing' }
    });

    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), originalName);
    form.append('projectId', projectId);
    form.append('plan', plan);

    const aiResponse = await axios.post(`${FASTAPI_URL}/analyze`, form, {
      headers: form.getHeaders(),
      timeout: 300000, // 300s — Groq rate limit (429) backoffs can take several minutes
    });

    const ai = aiResponse.data;

    await prisma.document.update({
      where: { id: docId },
      data: {
        status: 'Analyzed',
        analysisSource: ai.analysis_source || 'groq',
        summary: ai.summary || null,
        extractedText: ai.extracted_text ? ai.extracted_text.substring(0, 5000) : null,
        wordCount: ai.word_count || 0,
        riskScore: typeof ai.risk_score === 'number' ? ai.risk_score : null,
        riskLevel: ai.risk_level || null,
        keyInsights: Array.isArray(ai.key_insights) ? ai.key_insights : [],
        recommendations: Array.isArray(ai.recommendations) ? ai.recommendations : [],
        riskCategories: ai.risk_categories || {},
        scope: ai.scope || null,
        deliverables: ai.deliverables || [],
        blockers: ai.blockers || [],
        scheduleForecast: ai.schedule_forecast || null,
        userStories: ai.user_stories || [],
        riskRegister: ai.risk_register || [],
        projectHealth: ai.project_health || null,
        confidence: typeof ai.confidence_score === 'number' ? ai.confidence_score : null,
        
        missingDocs: ai.missing_documentation || [],
        traceability: ai.traceability_gaps || [],
        sprintSummary: typeof ai.sprint_summary === 'object' ? JSON.stringify(ai.sprint_summary) : (ai.sprint_summary || null),
        meetingMinutes: ai.meeting_minutes || null,
        decisions: ai.decisions || [],
        actionItems: ai.action_items || [],
        
        processingTimeMs: ai.processing_time_ms || null,
        errorMessage: null,
      }
    });

    console.log(`✅ Analyzed doc ${docId}: ${ai.risk_level} (score: ${ai.risk_score})`);
    
    // Simulate Email/Slack Alert on Critical Risk
    if (ai.risk_score >= 70) {
      const msg = `🚨 CRITICAL RISK ALERT: Document "${originalName}" scored ${ai.risk_score}/100. Immediate attention required.`;
      console.log('\n=============================================');
      console.log(msg);
      console.log('=============================================\n');
      await prisma.alertLog.create({
        data: {
          documentId: docId,
          projectId,
          riskScore: ai.risk_score,
          riskLevel: ai.risk_level || 'High',
          alertType: 'slack',
          message: msg
        }
      });
    }

  } catch (err) {
    const msg = err.response?.data?.detail || err.message || 'Unknown error';
    console.error(`❌ Analysis failed for doc ${docId}:`, msg);
    await prisma.document.update({
      where: { id: docId },
      data: {
        status: 'Failed',
        errorMessage: msg,
      }
    });
  }
}

// ── POST /api/upload ──────────────────────────────────────────────────────────
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });

    // Save document record with Uploaded status immediately
    const doc = await prisma.document.create({
      data: {
        projectId,
        filename: req.file.filename,
        originalName: req.file.originalname,
        fileType: req.file.mimetype,
        size: req.file.size,
        status: 'Uploaded',
      }
    });

    // Respond immediately — fast upload UX
    res.status(200).json({
      message: 'File uploaded. Groq AI analysis starting...',
      document: doc,
    });

    // Fire analysis asynchronously — captured values in closure, not req.file reference
    const { path: filePath, originalname } = req.file;
    setImmediate(() => triggerAnalysis(doc.id, filePath, originalname, projectId, "enterprise"));

  } catch (err) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum size is 50MB.' });
    }
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Internal server error during upload' });
  }
});

// ── GET /api/upload/project/:projectId ───────────────────────────────────────
router.get('/project/:projectId', async (req, res) => {
  try {
    let documents = await prisma.document.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { createdAt: 'desc' }
    });
    
    // Exclude large text field from list as mongoose select('-extractedText') did
    documents = documents.map(doc => {
      const { extractedText, ...rest } = doc;
      return rest;
    });
    
    res.json(documents);
  } catch (err) {
    console.error('Error fetching documents:', err);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

module.exports = router;
