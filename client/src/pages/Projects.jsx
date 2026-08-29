import React, { useState, useEffect } from 'react';
import { getProjects, createProject, deleteProject, errorMessage } from '../services/api';
import { Plus, FolderKanban, Calendar, Trash2, ArrowRight, FileText, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

const Projects = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [errors, setErrors] = useState({});
  const [createError, setCreateError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { fetchProjects(); }, []);

  const fetchProjects = async () => {
    try {
      const res = await getProjects();
      setProjects(res.data);
    } catch (err) {
      console.error('Failed to fetch projects', err);
    } finally {
      setLoading(false);
    }
  };

  const validate = () => {
    const e = {};
    if (!name.trim()) e.name = 'Project name is required';
    if (!description.trim()) e.description = 'Description is required';
    return e;
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setIsCreating(true);
    try {
      const res = await createProject({ name: name.trim(), description: description.trim() });
      setProjects([res.data, ...projects]);
      setName('');
      setDescription('');
      setCreateError('');
    } catch (err) {
      setCreateError(errorMessage(err, 'Could not create the project.'));
    } finally {
      setIsCreating(false);
    }
  };

  // The client shipped a deleteProject() helper that pointed at a route which
  // did not exist. The route is there now, and this is the control for it.
  const handleDelete = async (project) => {
    setDeleting(true);
    try {
      await deleteProject(project.id);
      setProjects(prev => prev.filter(p => p.id !== project.id));
      setConfirmDelete(null);
    } catch (err) {
      setCreateError(errorMessage(err, 'Could not delete the project.'));
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1 className="page-title">Projects</h1>
        <p className="page-subtitle">Create and manage your AI analysis projects</p>
      </div>

      <div className="responsive-split">

        {/* Create form */}
        <div className="card" style={{ alignSelf: 'start' }}>
          <h3 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 700 }}>New Project</h3>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="form-label">Project Name</label>
              <input
                className="form-input"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Q4 Contract Review"
                aria-label="Project name"
              />
              {errors.name && <span style={{ color: '#ef4444', fontSize: 12, marginTop: 4, display: 'block' }}>{errors.name}</span>}
            </div>
            <div>
              <label className="form-label">Description</label>
              <textarea
                className="form-input"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What documents will this project analyze?"
                aria-label="Project description"
                style={{ minHeight: 90, resize: 'vertical' }}
              />
              {errors.description && <span style={{ color: '#ef4444', fontSize: 12, marginTop: 4, display: 'block' }}>{errors.description}</span>}
            </div>
            <button type="submit" className="btn-primary" disabled={isCreating}>
              <Plus size={16} />
              {isCreating ? 'Creating...' : 'Create Project'}
            </button>
            {createError && (
              <span style={{ color: '#ef4444', fontSize: 12 }}>{createError}</span>
            )}
          </form>
        </div>

        {/* Project grid */}
        <div>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#94a3b8', padding: 40, fontSize: 14 }}>
              <div className="spinner" /> Loading projects...
            </div>
          ) : projects.length === 0 ? (
            <div className="card empty-state">
              <FolderKanban size={40} />
              <p>No projects yet. Create your first one!</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {projects.map((project, i) => (
                <div key={project.id} className="card fade-in" style={{ animationDelay: `${i * 0.05}s`, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <FolderKanban size={20} color="#6366f1" />
                    </div>
                    <button
                      onClick={() => setConfirmDelete(project)}
                      title="Delete project"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 4, borderRadius: 6 }}
                      onMouseOver={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = '#fef2f2'; }}
                      onMouseOut={e => { e.currentTarget.style.color = '#cbd5e1'; e.currentTarget.style.background = 'none'; }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div>
                    <h4 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{project.name}</h4>
                    <p style={{ margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {project.description}
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#94a3b8' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Calendar size={12} />
                        {new Date(project.createdAt).toLocaleDateString()}
                      </span>
                      {project._count && (
                        <>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }} title="Documents">
                            <FileText size={12} />{project._count.documents}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }} title="Team members">
                            <Users size={12} />{project._count.members}
                          </span>
                        </>
                      )}
                    </span>
                    <Link
                      to={`/upload?project=${project.id}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: '#6366f1', textDecoration: 'none' }}
                    >
                      Upload docs <ArrowRight size={13} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(2px)', padding: 16,
        }}>
          <div className="card" style={{ maxWidth: 420, width: '100%' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700 }}>
              Delete "{confirmDelete.name}"?
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
              This removes the project, its documents, its analyses and its knowledge base.
              You cannot undo this.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmDelete(null)}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 14, cursor: 'pointer', color: '#475569' }}
              >
                Keep project
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleting}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 14, fontWeight: 600, cursor: deleting ? 'wait' : 'pointer' }}
              >
                {deleting ? 'Deleting...' : 'Delete project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Projects;
