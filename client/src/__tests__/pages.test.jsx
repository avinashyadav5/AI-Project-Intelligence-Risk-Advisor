import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/**
 * Page render tests.
 *
 * Pages are where crashes hide: RiskReport alone is ~880 lines of conditional
 * rendering over AI output that may be null, empty, or a different shape than
 * expected. Each page is mounted with realistic data AND with empty data,
 * because "no documents yet" is the state every new user sees first.
 */

const ok = (data) => Promise.resolve({ data });

const ANALYZED_DOC = {
  id: 'd1',
  originalName: 'proposal.pdf',
  status: 'Analyzed',
  analysisSource: 'groq_pipeline',
  summary: 'A project proposal.',
  wordCount: 900,
  riskScore: 52,
  riskLevel: 'High',
  confidence: 76,
  size: 12345,
  createdAt: new Date().toISOString(),
  projectId: { name: 'Alpha', description: 'D' },
  keyInsights: [
    { severity: 'high', text: 'Vendor delay risk', evidence_quote: 'vendor is late', is_inferred: false },
    { severity: 'low', text: 'Docs thin', evidence_quote: null, is_inferred: true },
  ],
  recommendations: ['Escalate the vendor contract'],
  riskCategories: { technical: 40, timeline: 60, financial: null, operational: null, legal: null, _coverage: { low_coverage: true, categories_assessed: 2, categories_total: 5 } },
  riskRegister: [
    { title: 'Vendor slip', description: 'Late delivery', category: 'timeline', probability: 'high', impact: 'high', severity: 'high', evidence_quote: 'vendor is late', is_inferred: false, recommendation: 'Escalate' },
  ],
  scope: { objectives: ['Ship v1'], boundaries: ['No mobile'], assumptions: ['Team of 4'] },
  deliverables: [{ name: 'API', description: 'REST API', priority: 'high', status: 'identified', confidence: 80 }],
  blockers: [{ description: 'Awaiting sign-off', severity: 'high', impact: 'Blocks release', mitigation: 'Chase legal', confidence: 70 }],
  // Snake_case exactly as the AI service returns it.
  scheduleForecast: {
    status: 'computed',
    risk_level: 'High',
    schedule_risk_score: 57,
    reasoning: 'Computed from 5 tasks.',
    delay_factors: ['3 tasks overdue'],
    recommendations: ['Re-baseline'],
    totals: { total: 5, completed: 1, in_progress: 1, blocked: 1, not_started: 2 },
    overdue: [{ name: 'Build API', owner: 'Rahul', due_date: '2026-08-10', status: 'in_progress', days_overdue: 19 }],
    due_soon: [],
    blocked_tasks: [{ name: 'Deploy', owner: 'Rahul', status: 'blocked' }],
    unscheduled: ['Update SRS'],
    critical_path: { path: ['A', 'B', 'C'], length_days: 56, note: 'chain' },
    baseline_completion: '2026-08-25',
    projected_completion: '2026-09-18',
    projected_slip_days: 20,
  },
  userStories: [
    { id: 'US-1', epic: 'Auth', story: 'As a user, I want to log in so that I can access my data', acceptance_criteria: ['Given valid creds, when I submit, then I am signed in'], priority: 'high', evidence: 'The system shall authenticate users', confidence: 90 },
  ],
  projectHealth: {
    score: 64, grade: 'D',
    breakdown: {
      planning: { score: 70, reason: 'Objectives clear', evidence: 'Section 2', confidence: 80 },
      testing: { score: 0, reason: 'No evidence found in current documents.', evidence: '', confidence: 0 },
    },
    health_coverage: { low_coverage: true, categories_assessed: 2, categories_total: 4 },
  },
  missingDocs: [{ document_type: 'Test Plan', reason: 'Implied but absent', confidence: 70 }],
  traceability: [{ requirement: 'Login', missing_link: 'Testing', reasoning: 'No test case', satisfied: false }],
  sprintSummary: JSON.stringify({ sprint_goals: ['Ship auth'], completed_work: [], pending_work: [], velocity: 'n/a', risks: [], action_items: [], status: 'Detected' }),
  meetingMinutes: 'Discussed the vendor delay.',
  decisions: ['Escalate to procurement'],
  actionItems: [{ task: 'Call vendor', owner: 'Priya', deadline: '2026-09-01' }],
  completedActionItems: [],
  dismissedBlockers: [],
  extractedText: 'Some extracted text',
};

vi.mock('../services/api', () => {
  const api = {
    get: vi.fn((url) => {
      if (url.includes('/dashboard/stats')) {
        return ok({ activeProjects: 1, avgHealth: 64, criticalRisksCount: 1, teamMembersCount: 3, myTasks: 2, deadlines: 1, overdue: 1, blocked: 0, completed: 1, tasks: [], compliantProjects: 1, missingDocsCount: 2, traceabilityGaps: 1, criticalFindings: 0 });
      }
      if (url.includes('/projects')) {
        return ok([{ id: 'p1', name: 'Alpha', description: 'D', createdAt: new Date().toISOString(), _count: { documents: 1, members: 2 } }]);
      }
      return ok([]);
    }),
    post: vi.fn(() => ok({})),
    patch: vi.fn(() => ok({})),
    delete: vi.fn(() => ok({})),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  };
  return {
    default: api,
    API_BASE_URL: 'http://localhost:5000/api',
    SOCKET_URL: 'http://localhost:5000',
    errorMessage: (e, f) => f || 'error',
    login: vi.fn(() => ok({})),
    register: vi.fn(() => ok({})),
    getMe: vi.fn(() => ok({ id: 'u1', name: 'T', email: 't@e.com', role: 'pm' })),
    getProjects: vi.fn(() => ok([{ id: 'p1', name: 'Alpha', description: 'D', createdAt: new Date().toISOString(), _count: { documents: 1, members: 2 } }])),
    getProject: vi.fn(() => ok({ id: 'p1', name: 'Alpha' })),
    createProject: vi.fn(() => ok({ id: 'p2' })),
    deleteProject: vi.fn(() => ok({})),
    getProjectMessages: vi.fn(() => ok([])),
    getProjectActivity: vi.fn(() => ok([{ id: 'a1', action: 'document.uploaded', details: { name: 'proposal.pdf' }, createdAt: new Date().toISOString(), user: { name: 'T' } }])),
    runProjectAnalysis: vi.fn(() => ok({})),
    getProjectIntelligence: vi.fn(() => ok({ exists: false })),
    generateProjectDocument: vi.fn(() => ok({ markdown: '# Doc' })),
    getGeneratedDocuments: vi.fn(() => ok([])),
    getGeneratedDocument: vi.fn(() => ok({ docType: 'srs', markdown: '# Doc' })),
    uploadFile: vi.fn(() => ok({})),
    getProjectFiles: vi.fn(() => ok([ANALYZED_DOC])),
    reanalyzeDocument: vi.fn(() => ok({})),
    getDocument: vi.fn(() => ok(ANALYZED_DOC)),
    deleteDocument: vi.fn(() => ok({})),
    saveReportState: vi.fn(() => ok({})),
    getStats: vi.fn(() => ok({ totalProjects: 1, totalDocuments: 1, analyzedDocuments: 1, avgRiskScore: 52, riskDistribution: { Low: 0, Medium: 0, High: 1, Critical: 0 } })),
    getProjectTrends: vi.fn(() => ok({ documents: [], history: [] })),
    getProjectHealth: vi.fn(() => ok({ score: 64, grade: 'D', documents: 1, breakdown: [] })),
    sendChatMessage: vi.fn(() => ok({ answer: 'hi', sources: [] })),
    getChatHistory: vi.fn(() => ok([])),
    clearChatHistory: vi.fn(() => ok({})),
    getTeamMembers: vi.fn(() => ok({ members: [], pendingInvites: [] })),
    inviteMember: vi.fn(() => ok({})),
    joinProject: vi.fn(() => ok({ projectId: 'p1' })),
    removeMember: vi.fn(() => ok({})),
    getMilestones: vi.fn(() => ok([])),
    createMilestone: vi.fn(() => ok({ id: 'm1' })),
    updateMilestone: vi.fn(() => ok({ id: 'm1' })),
    deleteMilestone: vi.fn(() => ok({})),
    getNotifications: vi.fn(() => ok({ notifications: [], unreadCount: 0 })),
    markNotificationRead: vi.fn(() => ok({})),
    markAllNotificationsRead: vi.fn(() => ok({})),
    getProjectAlerts: vi.fn(() => ok([])),
    getDashboardStats: vi.fn(() => ok({})),
  };
});

vi.mock('socket.io-client', () => ({
  io: () => ({ emit: vi.fn(), on: vi.fn(), disconnect: vi.fn() }),
}));

import { ToastProvider } from '../context/ToastContext';
import { AuthContext } from '../context/AuthContext';

import Dashboard from '../pages/Dashboard';
import Projects from '../pages/Projects';
import Chat from '../pages/Chat';
import RiskReports from '../pages/RiskReports';
import RiskReport from '../pages/RiskReport';
import UploadDocuments from '../pages/UploadDocuments';
import PMDashboard from '../pages/PMDashboard';
import DeveloperDashboard from '../pages/DeveloperDashboard';
import AuditorDashboard from '../pages/AuditorDashboard';
import Join from '../pages/Join';
import Login from '../pages/Login';
import Register from '../pages/Register';
import Landing from '../pages/Landing';

const USER = { id: 'u1', name: 'T', email: 't@e.com', role: 'pm' };

const wrap = (ui, { user = USER, route = '/' } = {}) => render(
  <MemoryRouter initialEntries={[route]}>
    <AuthContext.Provider value={{ user, loading: false, login: vi.fn(), register: vi.fn(), logout: vi.fn() }}>
      <ToastProvider>{ui}</ToastProvider>
    </AuthContext.Provider>
  </MemoryRouter>
);

let errorSpy;
beforeEach(() => { errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { cleanup(); errorSpy.mockRestore(); });

const assertNoRuntimeError = async () => {
  await waitFor(() => {
    const fatal = errorSpy.mock.calls.find(c => {
      const msg = String(c[0]);
      return msg.includes('before initialization')
        || msg.includes('Cannot read propert')
        || msg.includes('is not a function')
        || msg.includes('undefined is not');
    });
    expect(fatal).toBeUndefined();
  });
};

describe('pages render with data', () => {
  const cases = [
    ['Landing', <Landing key="1" />],
    ['Login', <Login key="2" />],
    ['Register', <Register key="3" />],
    ['Dashboard', <Dashboard key="4" />],
    ['Projects', <Projects key="5" />],
    ['Chat', <Chat key="6" />],
    ['RiskReports', <RiskReports key="7" />],
    ['UploadDocuments', <UploadDocuments key="8" />],
    ['PMDashboard', <PMDashboard key="9" />],
    ['DeveloperDashboard', <DeveloperDashboard key="10" />],
    ['AuditorDashboard', <AuditorDashboard key="11" />],
    ['Join', <Join key="12" />],
  ];

  cases.forEach(([name, el]) => {
    it(name, async () => {
      expect(() => wrap(el)).not.toThrow();
      await assertNoRuntimeError();
    });
  });

  it('RiskReport with a full analysis', async () => {
    render(
      <MemoryRouter initialEntries={['/report/d1']}>
        <AuthContext.Provider value={{ user: USER, loading: false, logout: vi.fn() }}>
          <ToastProvider>
            <Routes><Route path="/report/:id" element={<RiskReport />} /></Routes>
          </ToastProvider>
        </AuthContext.Provider>
      </MemoryRouter>
    );
    expect(await screen.findByText(/proposal\.pdf/)).toBeTruthy();
    await assertNoRuntimeError();
  });
});

describe('empty and partial data', () => {
  it('RiskReport survives a minimal document', async () => {
    const api = await import('../services/api');
    // Everything the AI might omit: no register, no scope, no health, no forecast.
    api.getDocument.mockResolvedValueOnce({
      data: {
        id: 'd2', originalName: 'empty.txt', status: 'Analyzed',
        riskScore: null, riskLevel: 'Unknown', keyInsights: [], recommendations: [],
        riskRegister: [], riskCategories: {}, deliverables: [], blockers: [],
        userStories: [], missingDocs: [], traceability: [], decisions: [], actionItems: [],
        projectHealth: null, scheduleForecast: null, scope: null, sprintSummary: null,
        meetingMinutes: null, projectId: 'p1', createdAt: new Date().toISOString(),
      },
    });
    render(
      <MemoryRouter initialEntries={['/report/d2']}>
        <AuthContext.Provider value={{ user: USER, loading: false, logout: vi.fn() }}>
          <ToastProvider>
            <Routes><Route path="/report/:id" element={<RiskReport />} /></Routes>
          </ToastProvider>
        </AuthContext.Provider>
      </MemoryRouter>
    );
    expect(await screen.findByText(/empty\.txt/)).toBeTruthy();
    await assertNoRuntimeError();
  });

  it('RiskReport handles an insufficient-data schedule forecast', async () => {
    const api = await import('../services/api');
    api.getDocument.mockResolvedValueOnce({
      data: {
        ...ANALYZED_DOC,
        id: 'd3',
        scheduleForecast: {
          status: 'insufficient_data',
          risk_level: 'Unknown',
          schedule_risk_score: null,
          reasoning: 'No task list or milestone data available.',
          delay_factors: ['Schedule cannot be predicted.'],
          recommendations: ['Upload a task list.'],
        },
      },
    });
    render(
      <MemoryRouter initialEntries={['/report/d3']}>
        <AuthContext.Provider value={{ user: USER, loading: false, logout: vi.fn() }}>
          <ToastProvider>
            <Routes><Route path="/report/:id" element={<RiskReport />} /></Routes>
          </ToastProvider>
        </AuthContext.Provider>
      </MemoryRouter>
    );
    expect(await screen.findByText(/No task list or milestone data/i)).toBeTruthy();
    await assertNoRuntimeError();
  });

  it('pages survive a user with no projects', async () => {
    const api = await import('../services/api');
    api.getProjects.mockResolvedValue({ data: [] });
    api.getProjectFiles.mockResolvedValue({ data: [] });
    wrap(<RiskReports />);
    await assertNoRuntimeError();
    cleanup();
    wrap(<Projects />);
    await assertNoRuntimeError();
  });

  it('dashboards render for every role', async () => {
    for (const role of ['pm', 'developer', 'auditor', 'admin']) {
      cleanup();
      const page = role === 'developer' ? <DeveloperDashboard />
        : role === 'auditor' ? <AuditorDashboard />
        : <PMDashboard />;
      wrap(page, { user: { ...USER, role } });
      await assertNoRuntimeError();
    }
  });
});
