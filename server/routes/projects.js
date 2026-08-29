const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');
const auth = require('../middleware/auth');
const axios = require('axios');

const FASTAPI_URL = process.env.FASTAPI_URL || 'http://127.0.0.1:8000';

// Create a project
router.post('/', auth, async (req, res) => {
  try {
    const { name, description } = req.body;
    
    // As per user request: don't give option to create project to developer and auditor
    if (req.user.role === 'developer' || req.user.role === 'auditor') {
      return res.status(403).json({ error: 'Developers and Auditors cannot create projects' });
    }
    

    
    const newProject = await prisma.project.create({ 
      data: { 
        name, 
        description,
        ownerId: req.user.id
      } 
    });
    
    // Automatically add the creator as a project member
    await prisma.projectMembers.create({
      data: {
        projectId: newProject.id,
        userId: req.user.id,
        role: req.user.role
      }
    });

    res.status(201).json(newProject);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Get all projects accessible by the logged in user
router.get('/', auth, async (req, res) => {
  try {
    let projects;
    if (req.user.role === 'admin') {
      projects = await prisma.project.findMany({ orderBy: { createdAt: 'desc' } });
    } else {
      // Find projects where user is owner OR user is a member
      projects = await prisma.project.findMany({
        where: {
          OR: [
            { ownerId: req.user.id },
            { members: { some: { userId: req.user.id } } }
          ]
        },
        orderBy: { createdAt: 'desc' }
      });
    }
    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Get a single project by id
router.get('/:id', auth, async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ 
      where: { id: req.params.id },
      include: { members: true }
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Access control
    if (req.user.role !== 'admin' && project.ownerId !== req.user.id) {
      const isMember = project.members.some(m => m.userId === req.user.id);
      if (!isMember) {
        return res.status(403).json({ error: 'Access denied to this project' });
      }
    }

    res.json(project);
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});
// Fetch project chat messages
router.get('/:id/messages', auth, async (req, res) => {
  try {
    const messages = await prisma.groupMessage.findMany({
      where: { projectId: req.params.id },
      include: {
        sender: { select: { id: true, name: true, role: true } }
      },
      orderBy: { createdAt: 'asc' }
    });
    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Generate project document
router.post('/:id/generate-document', auth, async (req, res) => {
  try {
    const { docType } = req.body;
    if (!docType) {
      return res.status(400).json({ error: 'docType is required' });
    }

    // Try generating directly via FAISS
    let response = await axios.post(`${FASTAPI_URL}/generate`, {
      project_id: req.params.id,
      doc_type: docType
    }, { timeout: 120000 });

    res.json(response.data);
  } catch (error) {
    // If FAISS is empty (404), fallback to passing all DB text as context override
    if (error.response && error.response.status === 404) {
      try {
        const docs = await prisma.document.findMany({
          where: { projectId: req.params.id, status: 'Analyzed' },
          select: { extractedText: true, originalName: true, summary: true }
        });
        
        if (docs.length === 0) {
           return res.status(400).json({ error: 'No documents analyzed in this project yet. Please upload files first.' });
        }

        const contextParts = docs.map(d => `[Document: ${d.originalName}]\n${d.extractedText || d.summary || ''}`);
        const dbContext = contextParts.join('\n\n---\n\n').substring(0, 15000); // cap to ~15k chars to avoid token limit

        let retryResponse = await axios.post(`${FASTAPI_URL}/generate`, {
          project_id: req.params.id,
          doc_type: docType,
          context_override: dbContext
        }, { timeout: 120000 });

        return res.json(retryResponse.data);
      } catch (fallbackError) {
        console.error('Error generating document with fallback:', fallbackError.message, fallbackError.response?.data);
        return res.status(500).json({ 
          error: fallbackError.response?.data?.detail || fallbackError.message || 'Failed to generate document' 
        });
      }
    }

      console.error('Error generating document:', error);
      res.status(500).json({ 
        error: error.response?.data?.detail || error.message || 'Failed to generate document',
        fullError: String(error)
      });
  }
});

module.exports = router;
