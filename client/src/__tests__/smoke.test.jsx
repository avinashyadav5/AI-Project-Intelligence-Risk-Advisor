import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Render smoke tests.
 *
 * A production build succeeds even when a component throws the moment it
 * renders — a temporal dead zone reference, a missing prop guard, an undefined
 * array read. These tests actually mount every screen and component so those
 * failures surface here instead of in front of an examiner.
 *
 * The API layer is mocked, so nothing here needs a database or the AI service.
 */

// ── API mock ────────────────────────────────────────────────────────────────
const ok = (data) => Promise.resolve({ data });

vi.mock('../services/api', () => {
  const api = {
    get: vi.fn(() => ok([])),
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
    getMe: vi.fn(() => ok({ id: 'u1', name: 'Test User', email: 't@example.com', role: 'pm' })),
    getProjects: vi.fn(() => ok([{ id: 'p1', name: 'Alpha', description: 'D', createdAt: new Date().toISOString(), _count: { documents: 2, members: 3 } }])),
    getProject: vi.fn(() => ok({ id: 'p1', name: 'Alpha' })),
    createProject: vi.fn(() => ok({ id: 'p2', name: 'Beta' })),
    deleteProject: vi.fn(() => ok({})),
    getProjectMessages: vi.fn(() => ok([])),
    getProjectActivity: vi.fn(() => ok([])),
    runProjectAnalysis: vi.fn(() => ok({})),
    getProjectIntelligence: vi.fn(() => ok({ exists: false })),
    generateProjectDocument: vi.fn(() => ok({ markdown: '# Hi' })),
    getGeneratedDocuments: vi.fn(() => ok([])),
    getGeneratedDocument: vi.fn(() => ok({ docType: 'srs', markdown: '# Hi' })),
    uploadFile: vi.fn(() => ok({})),
    getProjectFiles: vi.fn(() => ok([])),
    reanalyzeDocument: vi.fn(() => ok({})),
    getDocument: vi.fn(() => ok({})),
    deleteDocument: vi.fn(() => ok({})),
    saveReportState: vi.fn(() => ok({})),
    getStats: vi.fn(() => ok({ totalProjects: 1, totalDocuments: 2, analyzedDocuments: 2, avgRiskScore: 40, riskDistribution: { Low: 1, Medium: 1, High: 0, Critical: 0 } })),
    getProjectTrends: vi.fn(() => ok({ documents: [], history: [] })),
    getProjectHealth: vi.fn(() => ok({ score: null, grade: null, documents: 0, breakdown: [] })),
    sendChatMessage: vi.fn(() => ok({ answer: 'hi', sources: [] })),
    getChatHistory: vi.fn(() => ok([])),
    clearChatHistory: vi.fn(() => ok({})),
    getTeamMembers: vi.fn(() => ok({ members: [], pendingInvites: [] })),
    inviteMember: vi.fn(() => ok({ inviteLink: '/join?token=x' })),
    joinProject: vi.fn(() => ok({ projectId: 'p1' })),
    removeMember: vi.fn(() => ok({})),
    getMilestones: vi.fn(() => ok([])),
    createMilestone: vi.fn(() => ok({ id: 'm1', name: 'T' })),
    updateMilestone: vi.fn(() => ok({ id: 'm1', status: 'in_progress' })),
    deleteMilestone: vi.fn(() => ok({})),
    getNotifications: vi.fn(() => ok({ notifications: [], unreadCount: 0 })),
    markNotificationRead: vi.fn(() => ok({})),
    markAllNotificationsRead: vi.fn(() => ok({})),
    getProjectAlerts: vi.fn(() => ok([])),
    getDashboardStats: vi.fn(() => ok({})),
  };
});

// socket.io must not open a real connection in tests.
vi.mock('socket.io-client', () => ({
  io: () => ({ emit: vi.fn(), on: vi.fn(), disconnect: vi.fn() }),
}));

import { ToastProvider } from '../context/ToastContext';
import { AuthContext } from '../context/AuthContext';

const USER = { id: 'u1', name: 'Test User', email: 't@example.com', role: 'pm' };

const wrap = (ui, user = USER) => render(
  <MemoryRouter>
    <AuthContext.Provider value={{ user, loading: false, login: vi.fn(), register: vi.fn(), logout: vi.fn() }}>
      <ToastProvider>{ui}</ToastProvider>
    </AuthContext.Provider>
  </MemoryRouter>
);

// Fail loudly on a React error rather than letting it pass as a warning.
let errorSpy;
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  errorSpy.mockRestore();
});

// ── Components ──────────────────────────────────────────────────────────────
import NotificationBell from '../components/NotificationBell';
import UserMenu from '../components/UserMenu';
import TeamPanel from '../components/TeamPanel';
import RiskAlerts from '../components/RiskAlerts';
import HealthTrend from '../components/HealthTrend';
import ProjectIntelligence from '../components/ProjectIntelligence';
import TaskBoard from '../components/TaskBoard';
import JoinProjectModal from '../components/JoinProjectModal';
import DocumentGeneratorModal from '../components/DocumentGeneratorModal';
import ProjectChat from '../components/ProjectChat';
import Navbar from '../components/Navbar';

describe('components render without throwing', () => {
  const cases = [
    ['NotificationBell', <NotificationBell key="a" />],
    ['UserMenu', <UserMenu key="b" />],
    ['TeamPanel', <TeamPanel key="c" projectId="p1" />],
    ['RiskAlerts', <RiskAlerts key="d" projectId="p1" />],
    ['HealthTrend', <HealthTrend key="e" projectId="p1" />],
    ['ProjectIntelligence', <ProjectIntelligence key="f" projectId="p1" />],
    ['TaskBoard', <TaskBoard key="g" projectId="p1" />],
    ['ProjectChat', <ProjectChat key="h" projectId="p1" />],
    ['Navbar', <Navbar key="i" />],
    // The generator modal is mounted by the upload page even while closed, so
    // a render-time throw here takes the whole page down.
    ['DocumentGeneratorModal (closed)', <DocumentGeneratorModal key="j" isOpen={false} onClose={() => {}} projectId="p1" />],
    ['DocumentGeneratorModal (open)', <DocumentGeneratorModal key="k" isOpen onClose={() => {}} projectId="p1" />],
    ['JoinProjectModal (closed)', <JoinProjectModal key="l" isOpen={false} onClose={() => {}} />],
    ['JoinProjectModal (open)', <JoinProjectModal key="m" isOpen onClose={() => {}} />],
  ];

  cases.forEach(([name, element]) => {
    it(name, async () => {
      expect(() => wrap(element)).not.toThrow();
      await waitFor(() => {
        const thrown = errorSpy.mock.calls.find(c =>
          String(c[0]).includes('before initialization') ||
          String(c[0]).includes('Cannot read propert') ||
          String(c[0]).includes('is not a function')
        );
        expect(thrown).toBeUndefined();
      });
    });
  });
});

// ── Behaviour ───────────────────────────────────────────────────────────────
describe('behaviour', () => {
  it('user menu signs out', async () => {
    const logout = vi.fn();
    render(
      <MemoryRouter>
        <AuthContext.Provider value={{ user: USER, loading: false, logout }}>
          <ToastProvider><UserMenu /></ToastProvider>
        </AuthContext.Provider>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /sign out/i }));
    expect(logout).toHaveBeenCalled();
  });

  it('task board shows an empty state and can open the add form', async () => {
    wrap(<TaskBoard projectId="p1" />);
    expect(await screen.findByText(/No tasks yet/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /add task/i }));
    expect(screen.getByLabelText(/task name/i)).toBeTruthy();
  });

  it('task board hides editing controls from auditors', async () => {
    wrap(<TaskBoard projectId="p1" />, { ...USER, role: 'auditor' });
    await waitFor(() => expect(screen.queryByText(/No tasks yet/i)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /add task/i })).toBeNull();
  });

  it('join modal rejects an empty token', async () => {
    const onClose = vi.fn();
    wrap(<JoinProjectModal isOpen onClose={onClose} />);
    const input = screen.getByLabelText(/invite link or token/i);
    fireEvent.change(input, { target: { value: '   ' } });
    const submit = screen.getByRole('button', { name: /^join$/i });
    expect(submit.disabled).toBe(true);
  });

  it('join modal accepts a full invite URL', async () => {
    const api = await import('../services/api');
    wrap(<JoinProjectModal isOpen onClose={() => {}} onJoined={() => {}} />);
    fireEvent.change(screen.getByLabelText(/invite link or token/i), {
      target: { value: 'http://localhost:5173/join?token=abc123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^join$/i }));
    await waitFor(() => expect(api.joinProject).toHaveBeenCalledWith('abc123'));
  });

  it('notification bell shows an unread count', async () => {
    const api = await import('../services/api');
    api.getNotifications.mockResolvedValueOnce({
      data: {
        notifications: [{ id: 'n1', message: 'Critical risk found', type: 'risk', isRead: false, createdAt: new Date().toISOString() }],
        unreadCount: 1,
      },
    });
    wrap(<NotificationBell />);
    expect(await screen.findByText('1')).toBeTruthy();
  });

  it('project intelligence offers to run when none exists', async () => {
    wrap(<ProjectIntelligence projectId="p1" />);
    expect(await screen.findByRole('button', { name: /run analysis/i })).toBeTruthy();
  });
});
