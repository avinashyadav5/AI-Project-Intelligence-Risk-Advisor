import React, { useState, useEffect } from 'react';
import { getProjects, createProject } from '../services/api';
import { Plus, FolderKanban, Calendar, Trash2, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const Projects = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [errors, setErrors] = useState({});

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
    } catch (err) {
      console.error('Failed to create project', err);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1 className="page-title">Projects</h1>
        <p className="page-subtitle">Create and manage your AI analysis projects</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20 }}>

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
                style={{ minHeight: 90, resize: 'vertical' }}
              />
              {errors.description && <span style={{ color: '#ef4444', fontSize: 12, marginTop: 4, display: 'block' }}>{errors.description}</span>}
            </div>
            <button type="submit" className="btn-primary" disabled={isCreating}>
              <Plus size={16} />
              {isCreating ? 'Creating...' : 'Create Project'}
            </button>
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
                <div key={project._id} className="card fade-in" style={{ animationDelay: `${i * 0.05}s`, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <FolderKanban size={20} color="#6366f1" />
                    </div>
                  </div>

                  <div>
                    <h4 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{project.name}</h4>
                    <p style={{ margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {project.description}
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#94a3b8' }}>
                      <Calendar size={12} />
                      {new Date(project.createdAt).toLocaleDateString()}
                    </span>
                    <Link
                      to={`/upload?project=${project._id}`}
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
    </div>
  );
};

export default Projects;
