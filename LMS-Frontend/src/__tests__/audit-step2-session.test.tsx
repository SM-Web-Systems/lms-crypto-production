import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../context/AuthContext';
import { useAuth } from '../context/useAuth';
import { homeForUser } from '../utils/authorization';
import { ApiRequestError } from '../utils/apiError';
import type { User } from '../types/api';

const api = vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../services/api',()=>({default:api,setTokenGetter:vi.fn(),onUnauthorized:()=>()=>{}}));
const student: User={id:'session-user',name:'Audit',email:'audit@example.invalid',walletAddress:null,walletLinkingStatus:'none',workspaces:['student'],permissions:['course.view','course.submit'],defaultWorkspace:'student'};
const sponsor: User={...student,workspaces:['sponsor','student'],defaultWorkspace:'sponsor',permissions:['course.view','course.submit','cohort.view_own']};
const response=(user:User)=>({data:{success:true,data:user}});
function State() { const {user,isLoading}=useAuth(); return <><p>{isLoading?'Loading':user?homeForUser(user):'Signed out'}</p><output data-testid="current-authorization">{JSON.stringify(user)}</output></>; }
beforeEach(()=>{vi.clearAllMocks();localStorage.setItem('lms_token','audit-session');api.get.mockResolvedValue(response(student));});

describe('A03 — refresh effective authorization in an open session',()=>{
  it('replaces stale role hints with current context and supports a response with no legacy field', async () => {
    render(<AuthProvider><State /></AuthProvider>);
    await waitFor(()=>expect(screen.getByText('/student')).toBeInTheDocument());
    expect(JSON.parse(screen.getByTestId('current-authorization').textContent!)).not.toHaveProperty('role');
    const current = sponsor;
    api.get.mockResolvedValueOnce(response({...current, rbacRoles:['sponsor'], roleSummaries:[]}));
    fireEvent(window,new Event('focus'));
    await waitFor(()=>expect(screen.getByText('/sponsor')).toBeInTheDocument());
    const refreshed = JSON.parse(screen.getByTestId('current-authorization').textContent!);
    expect(refreshed).not.toHaveProperty('role');
    expect(refreshed.rbacRoles).toEqual(['sponsor']);
  });
  it('restores effective roles and refreshes grants on focus',async()=>{
    render(<AuthProvider><State /></AuthProvider>);
    await waitFor(()=>expect(screen.getByText('/student')).toBeInTheDocument());
    api.get.mockResolvedValueOnce(response(sponsor));
    fireEvent(window,new Event('focus'));
    await waitFor(()=>expect(screen.getByText('/sponsor')).toBeInTheDocument());
  });
  it('a revoked authorization session signs out on revalidation',async()=>{
    render(<AuthProvider><State /></AuthProvider>);
    await waitFor(()=>expect(screen.getByText('/student')).toBeInTheDocument());
    api.get.mockRejectedValueOnce(new ApiRequestError({status:401,message:'Authorization changed'}));
    fireEvent(window,new Event('focus'));
    await waitFor(()=>expect(screen.getByText('Signed out')).toBeInTheDocument());
    expect(localStorage.getItem('lms_token')).toBeNull();
  });
  it('a temporary failure during revalidation retains the active session',async()=>{
    render(<AuthProvider><State /></AuthProvider>);
    await waitFor(()=>expect(screen.getByText('/student')).toBeInTheDocument());
    api.get.mockRejectedValueOnce(new ApiRequestError({status:503,message:'Unavailable'}));
    await act(async()=>{fireEvent(window,new Event('focus'));});
    expect(screen.getByText('/student')).toBeInTheDocument();
    expect(localStorage.getItem('lms_token')).toBe('audit-session');
  });
  it('a late authorization response cannot overwrite a newer context',async()=>{
    render(<AuthProvider><State /></AuthProvider>);
    await waitFor(()=>expect(screen.getByText('/student')).toBeInTheDocument());
    let resolve!: (value: ReturnType<typeof response>)=>void;
    api.get.mockImplementationOnce(()=>new Promise(done=>{resolve=done;})).mockResolvedValueOnce(response(sponsor));
    fireEvent(window,new Event('focus'));
    fireEvent(window,new Event('focus'));
    await waitFor(()=>expect(screen.getByText('/sponsor')).toBeInTheDocument());
    await act(async()=>{resolve(response(student));});
    expect(screen.getByText('/sponsor')).toBeInTheDocument();
  });
});
