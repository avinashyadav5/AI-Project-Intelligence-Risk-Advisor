const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');
const auth = require('../middleware/auth');
const { requireProjectAccess, requireRole } = require('../middleware/auth');
const ai = require('../utils/aiService');
const events = require('../utils/events');
const { removeUploads } = require('../utils/files');

const DOC_TYPE_TITLES = {
  user_stories: 'Master User Stories',
  risk_register: 'Global Risk Register',
  action_items: 'Combined Action Items',
  srs: 'Software Requirements Specification',
  test_plan: 'Test Plan',
  status_report: 'Project Status Report',
  api_specs: 'API Specifications',
};

// ── POST /api/projects — create ──────────────────────────────────────────────
router.post('/', auth, requireRole('pm'), async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'A project name is required.' });
    }

    const newProject = await prisma.project.create({
      data: {
        name: String(name).trim(),
        description: String(description || '').trim(),
        ownerId: req.user.id,
      },
    });

    await prisma.projectMembers.create({
      data: { projectId: newProject.id, userId: req.user.id, role: req.user.role },
    });

    await events.logActivity(newProject.id, req.user.id, 'project.created', { name: newProject.name });

    res.status(201).json(newProject);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project.' });
  }
});

// ── GET /api/projects — list ─────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const where = req.user.role === 'admin'
      ? {}
      : { OR: [{ ownerId: req.user.id }, { members: { some: { userId: req.user.id } } }] };

    const projects = await prisma.project.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { documents: true, members: true, milestones: true } } },
    });
    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects.' });
  }
});

// ── GET /api/projects/:id ────────────────────────────────────────────────────
router.get('/:id', auth, requireProjectAccess(req => req.params.id), async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
        _count: { select: { documents: true, milestones: true } },
      },
    });
    res.json(project);
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: 'Failed to fetch project.' });
  }
});

// ── DELETE /api/projects/:id ─────────────────────────────────────────────────
// The client had a deleteProject() helper pointing at a route that never
// existed. Deleting also purges the project's knowledge base.
router.delete('/:id', auth, requireProjectAccess(req => req.params.id), async (req, res) => {
  try {
    const project = req.project;
    const isOwner = project.ownerId === req.user.id;
    if (req.user.role !== 'admin' && !isOwner) {
      return res.status(403).json({ error: 'Only the project owner or an admin can delete a project.' });
    }

    // Read the filenames before the cascade removes the document rows,
    // otherwise the files are orphaned on disk with nothing referencing them.
    const documents = await prisma.document.findMany({
      where: { projectId: project.id },
      select: { filename: true },
    });

    await ai.purgeProjectKB(project.id);
    await prisma.project.delete({ where: { id: project.id } });
    removeUploads(documents.map(d => d.filename));

    res.json({ message: 'Project deleted.', id: project.id });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project.' });
  }
});

// ── GET /api/projects/:id/messages — team chat history ───────────────────────
router.get('/:id/messages', auth, requireProjectAccess(req => req.params.id), async (req, res) => {
  try {
    const messages = await prisma.groupMessage.findMany({
      where: { projectId: req.params.id },
      include: { sender: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'asc' },
      take: 300,
    });
    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages.' });
  }
});

// ── GET /api/projects/:id/activity — real activity feed ──────────────────────
router.get('/:id/activity', auth, requireProjectAccess(req => req.params.id), async (req, res) => {
  try {
    const logs = await prisma.activityLog.findMany({
      where: { projectId: req.params.id },
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(req.query.limit, 10) || 20, 100),
    });
    res.json(logs);
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({ error: 'Failed to fetch activity.' });
  }
});

// ── POST /api/projects/:id/analyze — project-level intelligence ──────────────
/**
 * Runs the multi-agent pipeline across the project's unified knowledge base
 * rather than one document at a time, and feeds the project's real milestones
 * and dependencies into the deterministic schedule forecast.
 */
router.post(
  '/:id/analyze',
  auth,
  requireProjectAccess(req => req.params.id),
  requireRole('pm', 'developer', 'auditor'),
  async (req, res) => {
    const projectId = req.params.id;
    try {
      const milestoneRecords = await prisma.milestone.findMany({
        where: { projectId },
        include: { dependencies: { include: { dependsOn: { select: { id: true, name: true } } } } },
      });

      const milestones = milestoneRecords.map(m => ({
        id: m.id,
        name: m.name,
        owner: m.owner || 'Unassigned',
        status: m.status,
        progress: m.progress,
        dueDate: m.dueDate ? m.dueDate.toISOString().slice(0, 10) : null,
        startDate: m.startDate ? m.startDate.toISOString().slice(0, 10) : null,
        effort: m.effort,
        depends_on: m.dependencies.map(d => d.dependsOn?.name).filter(Boolean),
      }));

      let response;
      try {
        response = await ai.post('/analyze-project', { project_id: projectId, milestones }, { timeout: 300000 });
      } catch (err) {
        // Knowledge base empty — retry with the text stored in Postgres.
        if (err.response?.status === 404) {
          const docs = await prisma.document.findMany({
            where: { projectId, status: 'Analyzed' },
            select: { extractedText: true, originalName: true, summary: true },
          });
          if (docs.length === 0) {
            return res.status(400).json({
              error: 'Upload and analyse at least one document before running project analysis.',
            });
          }
          const dbContext = docs
            .map(d => `[Document: ${d.originalName}]\n${d.extractedText || d.summary || ''}`)
            .join('\n\n---\n\n')
            .substring(0, 20000);

          response = await ai.post('/analyze-project', {
            project_id: projectId,
            milestones,
            context_override: dbContext,
          }, { timeout: 300000 });
        } else {
          throw err;
        }
      }

      const data = response.data;

      const record = await prisma.projectIntelligence.create({
        data: {
          projectId,
          riskScore: typeof data.risk_score === 'number' ? Math.round(data.risk_score) : null,
          riskLevel: data.risk_level || null,
          healthScore: data.project_health?.score ?? null,
          healthGrade: data.project_health?.grade ?? null,
          confidence: typeof data.confidence_score === 'number' ? Math.round(data.confidence_score) : null,
          summary: data.summary || null,
          scope: data.scope || null,
          deliverables: data.deliverables || [],
          blockers: data.blockers || [],
          riskRegister: data.risk_register || [],
          riskCategories: data.risk_categories || {},
          projectHealth: data.project_health || null,
          scheduleForecast: data.schedule_forecast || null,
          userStories: data.user_stories || [],
          missingDocs: data.missing_documentation || [],
          traceability: data.traceability_gaps || [],
          recommendations: data.recommendations || [],
          sourceDocuments: data.source_documents || [],
          documentsCovered: data.documents_covered || 0,
          milestonesUsed: data.milestones_used || 0,
          analysisSource: data.analysis_source || null,
          createdBy: req.user.id,
        },
      });

      await events.logActivity(projectId, req.user.id, 'project.analyzed', {
        riskLevel: data.risk_level,
        healthScore: data.project_health?.score ?? null,
        documentsCovered: data.documents_covered,
      });

      await events.recordHealthSnapshot(projectId, {
        health: data.project_health,
        riskScore: data.risk_score,
      });

      await events.notifyProject(projectId, {
        type: 'analysis',
        message: `Project analysis complete — health ${data.project_health?.score ?? '?'}/100, ${data.risk_level || 'Unknown'} risk.`,
        link: `/upload?project=${projectId}`,
        excludeUserId: req.user.id,
      });

      res.json({ ...data, intelligenceId: record.id, createdAt: record.createdAt });
    } catch (error) {
      console.error('Project analysis error:', error.message);
      res.status(502).json({
        error: error.response?.data?.detail || 'Project analysis failed. Check that the AI service is running.',
      });
    }
  }
);

// ── GET /api/projects/:id/intelligence — latest project-level analysis ───────
router.get('/:id/intelligence', auth, requireProjectAccess(req => req.params.id), async (req, res) => {
  try {
    const latest = await prisma.projectIntelligence.findFirst({
      where: { projectId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) {
      return res.json({ exists: false, message: 'No project-level analysis has been run yet.' });
    }
    res.json({ exists: true, ...latest });
  } catch (error) {
    console.error('Error fetching intelligence:', error);
    res.status(500).json({ error: 'Failed to fetch project intelligence.' });
  }
});

// ── POST /api/projects/:id/generate-document ─────────────────────────────────
router.post(
  '/:id/generate-document',
  auth,
  requireProjectAccess(req => req.params.id),
  async (req, res) => {
    const projectId = req.params.id;
    try {
      const { docType, save = true } = req.body;
      if (!docType) return res.status(400).json({ error: 'A document type is required.' });

      let response;
      try {
        response = await ai.post('/generate', { project_id: projectId, doc_type: docType }, { timeout: 120000 });
      } catch (error) {
        if (error.response?.status !== 404) throw error;

        const docs = await prisma.document.findMany({
          where: { projectId, status: 'Analyzed' },
          select: { extractedText: true, originalName: true, summary: true },
        });
        if (docs.length === 0) {
          return res.status(400).json({
            error: 'No analyzed documents in this project yet. Upload a file first.',
          });
        }
        const dbContext = docs
          .map(d => `[Document: ${d.originalName}]\n${d.extractedText || d.summary || ''}`)
          .join('\n\n---\n\n')
          .substring(0, 15000);

        response = await ai.post('/generate', {
          project_id: projectId,
          doc_type: docType,
          context_override: dbContext,
        }, { timeout: 120000 });
      }

      const markdown = response.data.markdown || '';
      let saved = null;

      // Generated documents used to vanish when the modal closed. They are now
      // kept with the project so the team can come back to them.
      if (save && markdown.trim()) {
        saved = await prisma.generatedDocument.create({
          data: {
            projectId,
            docType,
            title: DOC_TYPE_TITLES[docType] || 'Generated Document',
            markdown,
            sources: response.data.sources || [],
            createdBy: req.user.id,
          },
        });
        await events.logActivity(projectId, req.user.id, 'document.generated', {
          docType,
          generatedDocumentId: saved.id,
        });
      }

      res.json({ ...response.data, savedDocumentId: saved?.id || null });
    } catch (error) {
      console.error('Error generating document:', error.message);
      res.status(502).json({
        error: error.response?.data?.detail || error.message || 'Failed to generate the document.',
      });
    }
  }
);

// ── GET /api/projects/:id/generated-documents ────────────────────────────────
router.get('/:id/generated-documents', auth, requireProjectAccess(req => req.params.id), async (req, res) => {
  try {
    const docs = await prisma.generatedDocument.findMany({
      where: { projectId: req.params.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, docType: true, title: true, sources: true, createdAt: true, createdBy: true },
    });
    res.json(docs);
  } catch (error) {
    console.error('Error listing generated documents:', error);
    res.status(500).json({ error: 'Failed to list generated documents.' });
  }
});

// ── GET /api/projects/:id/generated-documents/:docId ─────────────────────────
router.get('/:id/generated-documents/:docId', auth, requireProjectAccess(req => req.params.id), async (req, res) => {
  try {
    const doc = await prisma.generatedDocument.findFirst({
      where: { id: req.params.docId, projectId: req.params.id },
    });
    if (!doc) return res.status(404).json({ error: 'Generated document not found.' });
    res.json(doc);
  } catch (error) {
    console.error('Error fetching generated document:', error);
    res.status(500).json({ error: 'Failed to fetch the generated document.' });
  }
});

module.exports = router;
