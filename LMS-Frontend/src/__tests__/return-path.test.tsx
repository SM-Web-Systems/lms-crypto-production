import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { User } from '../types/api';

const mocks = vi.hoisted(() => ({ user: null as User | null }));
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: mocks.user, isAuthenticated: !!mocks.user, isLoading: false, logout: vi.fn() }) }));
vi.mock('../pages/Login', () => ({ default: () => <p>Sign in page</p> }));

import { LoginRoute, ProtectedRoute } from '../App';
import { takeSsoReturn } from '../utils/ssoReturn';

function learner(): User {
  return { id: 'u', name: 'L', email: 'l@example.invalid', role: 'student', walletAddress: null, walletLinkingStatus: 'none',
    rbacRoles: ['student'], workspaces: ['student'], defaultWorkspace: 'student', permissions: ['course.view', 'course.submit', 'reward.view_own'] } as User;
}

function Where() { const l = useLocation(); return <p data-testid="where">{l.pathname + l.search + l.hash}</p>; }

function app(entry: string) {
  return render(<StrictMode><MemoryRouter initialEntries={[entry]}><Routes>
    <Route path="/login" element={<><LoginRoute /><Where /></>} />
    <Route path="/student/*" element={<ProtectedRoute allowedWorkspace="student"><Where /></ProtectedRoute>} />
    <Route path="*" element={<Where />} />
  </Routes></MemoryRouter></StrictMode>);
}

beforeEach(() => { sessionStorage.clear(); mocks.user = null; });

describe('UX-013 return path through sign-in', () => {
  it('remembers a protected deep link when sending a signed-out visitor to sign in', () => {
    app('/student/rewards/claim#claim=c1&signature=s1');
    expect(screen.getByText('Sign in page')).toBeInTheDocument();
    expect(takeSsoReturn()).toBe('/student/rewards/claim#claim=c1&signature=s1');
  });

  it('returns to the remembered path after sign-in, once', () => {
    app('/student/course?course=c-1').unmount();
    mocks.user = learner();
    const view = app('/login');
    expect(screen.getAllByTestId('where').at(-1)).toHaveTextContent('/student/course?course=c-1');
    view.unmount();
    expect(takeSsoReturn()).toBeNull();
  });

  it('goes to the workspace home when nothing was remembered', () => {
    mocks.user = learner();
    app('/login');
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/student$/);
  });
});
