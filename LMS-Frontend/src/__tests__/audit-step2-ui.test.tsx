import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { User } from '../types/api';
import { hasCapability, homeForUser } from '../utils/authorization';

const mocks = vi.hoisted(() => ({
  user: null as User | null, updateUser: vi.fn(), fetchStudents: vi.fn(), fetchSubmissions: vi.fn(),
  get: vi.fn(), post: vi.fn(), analytics: vi.fn(), completeSso:vi.fn(),
}));
vi.mock('../context/useAuth', () => ({useAuth: () => ({user:mocks.user,isAuthenticated:!!mocks.user,isLoading:false,logout:vi.fn(),updateUser:mocks.updateUser,completeSso:mocks.completeSso})}));
vi.mock('../services/api', () => ({default:{get:mocks.get,post:mocks.post},setTokenGetter:vi.fn(),onUnauthorized:()=>()=>{}}));
vi.mock('../context/DataContext', () => ({DataProvider: ({children}: {children:React.ReactNode}) => children, useData: () => ({
  students:[],submissions:[],studentsLoading:false,submissionsLoading:false,studentsError:null,submissionsError:null,
  fetchStudents:mocks.fetchStudents,fetchSubmissions:mocks.fetchSubmissions,
})}));
vi.mock('../services/messageService', () => ({messageService:{getUnreadCount:vi.fn().mockResolvedValue(0)}}));
vi.mock('../services/analyticsService', () => ({analyticsService:{getCourseAnalytics:mocks.analytics}}));
vi.mock('../components/GlobalSearchBar', () => ({default:()=>null}));
vi.mock('../components/NotificationBell', () => ({default:()=>null}));
vi.mock('../components/AnnouncementsPanel', () => ({AnnouncementsPanel:()=>null}));
vi.mock('../components/QuizAnalyticsPanel', () => ({QuizAnalyticsPanel:()=>null}));
vi.mock('../components/PricingManagement', () => ({PricingManagement:()=>null}));
vi.mock('../components/RbacAdminPanel', () => ({RbacAdminPanel:()=><p>Roles panel</p>}));
vi.mock('../components/PaymentAnalyticsPanel', () => ({PaymentAnalyticsPanel:()=>null}));
vi.mock('../components/CohortInsightsPanel', () => ({CohortInsightsPanel:()=>null}));
vi.mock('../components/SponsorROIPanel', () => ({SponsorROIPanel:()=>null}));
vi.mock('../components/TenantAdminPanel', () => ({TenantAdminPanel:()=><p>Tenants panel</p>}));
vi.mock('../components/EmailTemplatePanel', () => ({EmailTemplatePanel:()=>null}));
vi.mock('../components/BroadcastPanel', () => ({BroadcastPanel:()=>null}));
vi.mock('../components/MessageAuditPanel', () => ({MessageAuditPanel:()=>null}));

import { ProtectedRoute } from '../App';
import Layout from '../components/Layout';
import AdminDashboard from '../pages/AdminDashboard';
import SsoCallback from '../pages/SsoCallback';

function user(fields: Partial<User> = {}): User {
  return {id:'audit-user',name:'Audit',email:'audit@example.invalid',walletAddress:null,walletLinkingStatus:'none',
    rbacRoles:['student'],workspaces:['student'],defaultWorkspace:'student',permissions:['course.view','course.submit'],...fields};
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user=user(); mocks.analytics.mockResolvedValue([]);
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({json:async()=>({buildSha:'abcdef0'})}));
});

describe('A03 — workspace routes and navigation', () => {
  it('sponsor with legacy student opens the sponsor route and sponsor navigation', () => {
    mocks.user=user({rbacRoles:['sponsor'],workspaces:['sponsor'],defaultWorkspace:'sponsor',permissions:['impact_report.read']});
    render(<MemoryRouter initialEntries={['/sponsor']}><ProtectedRoute allowedWorkspace="sponsor"><Layout><p>Sponsor workspace</p></Layout></ProtectedRoute></MemoryRouter>);
    expect(screen.getByText('Sponsor workspace')).toBeInTheDocument();
    expect(screen.getByText('Impact Report')).toBeInTheDocument();
    expect(homeForUser(mocks.user)).toBe('/sponsor');
    expect(screen.queryByText('My Submissions')).not.toBeInTheDocument();
  });
  it('multi-role workspace selection changes navigation without changing identity', async () => {
    mocks.user=user({workspaces:['lecturer','student'],defaultWorkspace:'lecturer',rbacRoles:['instructor','student'],permissions:['course.view','course.manage','course.submit']});
    render(<MemoryRouter initialEntries={['/lecturer']}><Layout><p>Content</p></Layout></MemoryRouter>);
    expect(screen.getByText('Course Editor')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Workspace'),'student');
    expect(screen.getByText('My Submissions')).toBeInTheDocument();
    expect(screen.queryByText('Course Editor')).not.toBeInTheDocument();
    expect(mocks.user.id).toBe('audit-user');
  });
  it('legacy admin alone cannot open an administrator route', () => {
    mocks.user=user({permissions:[],workspaces:[],rbacRoles:[],defaultWorkspace:null});
    render(<MemoryRouter initialEntries={['/admin/users']}><ProtectedRoute allowedWorkspace="admin"><p>Secret role tools</p></ProtectedRoute></MemoryRouter>);
    expect(screen.getByText('Access unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Secret role tools')).not.toBeInTheDocument();
    expect(homeForUser(mocks.user)).toBe('/access-denied');
  });
  it('a valid admin workspace still needs the page capability', () => {
    mocks.user=user({workspaces:['admin'],defaultWorkspace:'admin',permissions:['system.view_audit_log']});
    render(<MemoryRouter initialEntries={['/admin/users']}><ProtectedRoute allowedWorkspace="admin"><p>Role tools</p></ProtectedRoute></MemoryRouter>);
    expect(screen.getByText('Access unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Role tools')).not.toBeInTheDocument();
  });
  it('updated authorization immediately removes an already-open restricted page', () => {
    mocks.user=user({workspaces:['admin'],permissions:['user.assign_role','user.view_all']});
    const view=render(<MemoryRouter initialEntries={['/admin/users']}><ProtectedRoute allowedWorkspace="admin"><p>Role tools</p></ProtectedRoute></MemoryRouter>);
    expect(screen.getByText('Role tools')).toBeInTheDocument();
    mocks.user={...mocks.user,permissions:[]};
    view.rerender(<MemoryRouter initialEntries={['/admin/users']}><ProtectedRoute allowedWorkspace="admin"><p>Role tools</p></ProtectedRoute></MemoryRouter>);
    expect(screen.queryByText('Role tools')).not.toBeInTheDocument();
    expect(screen.getByText('Access unavailable')).toBeInTheDocument();
  });
  it('unknown role names and missing authorization fail closed', () => {
    mocks.user=user({rbacRoles:['super-admin-imposter'],permissions:[],workspaces:[]});
    expect(hasCapability(mocks.user,'system.manage_roles')).toBe(false);
    expect(homeForUser(mocks.user)).toBe('/access-denied');
  });
});

describe('A09 — administrator tools honor individual capabilities', () => {
  it('baseline admin does not mount role or tenant controls', () => {
    mocks.user=user({workspaces:['admin'],permissions:['course.view','course.grade','user.view_all','system.view_audit_log']});
    render(<MemoryRouter initialEntries={['/admin']}><Layout><AdminDashboard /></Layout></MemoryRouter>);
    expect(screen.queryByText('Roles panel')).not.toBeInTheDocument();
    expect(screen.queryByText('Tenants panel')).not.toBeInTheDocument();
    expect(screen.queryByText('User Roles')).not.toBeInTheDocument();
  });
  it('RBAC admin-2 with legacy student can use roles without gaining tenant controls', () => {
    mocks.user=user({workspaces:['admin'],defaultWorkspace:'admin',rbacRoles:['admin-2'],permissions:['system.manage_roles','user.view_all','user.assign_role']});
    render(<MemoryRouter initialEntries={['/admin']}><Layout><AdminDashboard /></Layout></MemoryRouter>);
    expect(screen.getByText('Roles panel')).toBeInTheDocument();
    expect(screen.queryByText('Tenants panel')).not.toBeInTheDocument();
    expect(screen.getAllByText('User Roles').length).toBeGreaterThan(0);
    expect(mocks.fetchSubmissions).not.toHaveBeenCalled();
    expect(mocks.analytics).not.toHaveBeenCalled();
  });
});

describe('SSO workspace restoration', () => {
  it('uses the verified server context instead of a JWT routing hint', async () => {
    const sponsor=user({workspaces:['sponsor'],defaultWorkspace:'sponsor',permissions:['impact_report.read']});
    window.history.replaceState(null,'','/sso-callback#token=opaque-session-token');
    mocks.completeSso.mockImplementation(async(token)=>{localStorage.setItem('lms_token',token);return sponsor;});
    render(<MemoryRouter initialEntries={['/sso-callback']}><Routes>
      <Route path="/sso-callback" element={<SsoCallback />} />
      <Route path="/sponsor" element={<p>Verified sponsor landing</p>} />
    </Routes></MemoryRouter>);
    await waitFor(()=>expect(screen.getByText('Verified sponsor landing')).toBeInTheDocument());
    expect(mocks.completeSso).toHaveBeenCalledWith('opaque-session-token');
    expect(window.location.hash).toBe('');
  });
  it('SSO verification keeps a recoverable token and retries a transient outage',async()=>{
    const sponsor=user({workspaces:['sponsor'],defaultWorkspace:'sponsor'});
    window.history.replaceState(null,'','/sso-callback#token=recoverable-session');
    mocks.completeSso.mockImplementationOnce(async(token)=>{localStorage.setItem('lms_token',token);throw new Error('Offline');}).mockResolvedValueOnce(sponsor);
    render(<MemoryRouter initialEntries={['/sso-callback']}><Routes><Route path="/sso-callback" element={<SsoCallback/>}/><Route path="/sponsor" element={<p>Recovered SSO workspace</p>}/></Routes></MemoryRouter>);
    await waitFor(()=>expect(screen.getByText('Retry connection')).toBeInTheDocument());
    expect(localStorage.getItem('lms_token')).toBe('recoverable-session');
    await userEvent.click(screen.getByText('Retry connection'));
    await waitFor(()=>expect(screen.getByText('Recovered SSO workspace')).toBeInTheDocument());
  });
  it('a late failed SSO verification cannot clear a newer login token',async()=>{
    let reject!:(error:Error)=>void;
    window.history.replaceState(null,'','/sso-callback#token=old-session');
    mocks.completeSso.mockImplementationOnce((token)=>{localStorage.setItem('lms_token',token);return new Promise((_resolve,fail)=>{reject=fail;});});
    render(<MemoryRouter initialEntries={['/sso-callback']}><SsoCallback/></MemoryRouter>);
    await waitFor(()=>expect(mocks.completeSso).toHaveBeenCalled());
    localStorage.setItem('lms_token','newer-session');
    await act(async()=>reject(new Error('Old request failed')));
    expect(localStorage.getItem('lms_token')).toBe('newer-session');
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

});
