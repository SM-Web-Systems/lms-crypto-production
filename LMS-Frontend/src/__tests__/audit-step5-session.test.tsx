import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {AuthProvider} from '../context/AuthContext';
import {useAuth} from '../context/useAuth';
import {ApiRequestError} from '../utils/apiError';
import type {User} from '../types/api';

const mocks=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),unauthorized:undefined as undefined|((token:string)=>void)}));
vi.mock('../services/api',()=>({default:{get:mocks.get,post:mocks.post},setTokenGetter:vi.fn(),onUnauthorized:(listener:(token:string)=>void)=>{mocks.unauthorized=listener;return()=>{};}}));
const student:User={id:'student',name:'Learner',email:'student@example.invalid',role:'student',walletAddress:null,walletLinkingStatus:'none',workspaces:['student'],permissions:['course.view']};
const sponsor:User={...student,id:'sponsor',email:'sponsor@example.invalid',workspaces:['sponsor']};
const response=(user:User)=>({data:{success:true,data:user}});
let profileUpdate:(user:User)=>void;
function Probe(){const auth=useAuth();profileUpdate=auth.updateUser;return <>
  <p>{auth.isLoading?'Loading':auth.user?.email||'Signed out'}</p>
  <button onClick={()=>auth.login('sponsor@example.invalid','password')}>Login</button>
  <button onClick={()=>auth.logout()}>Logout</button>
</>;}
beforeEach(()=>{vi.clearAllMocks();localStorage.setItem('lms_session_marker','saved-token');mocks.get.mockResolvedValue(response(student));mocks.post.mockResolvedValue({data:{success:true,data:{user:sponsor,token:'new-token'}}});});

describe('A14 browser session recovery',()=>{
  it.each([new ApiRequestError({status:503,message:'Unavailable'}),new ApiRequestError({message:'Timeout'}),new Error('Network disconnected')])('retains a saved token during startup failure: %s',async(error)=>{
    mocks.get.mockRejectedValueOnce(error);render(<AuthProvider><Probe/></AuthProvider>);
    await waitFor(()=>expect(screen.getByText('Reconnect to your account')).toBeInTheDocument());
    expect(localStorage.getItem('lms_session_marker')).toBe('saved-token');expect(screen.queryByText('Signed out')).toBeNull();
    await act(async()=>fireEvent.click(screen.getByText('Try again')));
    await waitFor(()=>expect(screen.getByText(student.email)).toBeInTheDocument());
  });
  it('invalid credentials clear the token and return to sign in',async()=>{
    mocks.get.mockRejectedValueOnce(new ApiRequestError({status:401,message:'Expired'}));render(<AuthProvider><Probe/></AuthProvider>);
    await waitFor(()=>expect(screen.getByText('Signed out')).toBeInTheDocument());expect(localStorage.getItem('lms_session_marker')).toBeNull();
  });
  it('a later protected API 401 updates auth state centrally',async()=>{
    render(<AuthProvider><Probe/></AuthProvider>);await waitFor(()=>expect(screen.getByText(student.email)).toBeInTheDocument());
    await act(async()=>mocks.unauthorized?.('saved-token'));
    expect(screen.getByText('Signed out')).toBeInTheDocument();expect(localStorage.getItem('lms_session_marker')).toBeNull();
  });
  it('a stale protected request cannot sign out a newer login',async()=>{
    render(<AuthProvider><Probe/></AuthProvider>);await waitFor(()=>expect(screen.getByText(student.email)).toBeInTheDocument());
    await act(async()=>fireEvent.click(screen.getByText('Login')));
    await act(async()=>mocks.unauthorized?.('saved-token'));
    expect(screen.getByText(sponsor.email)).toBeInTheDocument();expect(localStorage.getItem('lms_session_marker')).not.toBe('saved-token');expect(localStorage.getItem('lms_session_marker')).not.toBe('new-token');
  });
  it('sign-out while hydration is in flight cannot restore the old user',async()=>{
    let resolve!:(value:ReturnType<typeof response>)=>void;
    render(<AuthProvider><Probe/></AuthProvider>);await waitFor(()=>expect(screen.getByText(student.email)).toBeInTheDocument());
    mocks.get.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));fireEvent(window,new Event('focus'));
    await waitFor(()=>expect(mocks.get).toHaveBeenCalledTimes(2));
    await act(async()=>fireEvent.click(screen.getByText('Logout')));
    await act(async()=>resolve(response(student)));
    expect(screen.getByText('Signed out')).toBeInTheDocument();
    expect(mocks.post).toHaveBeenCalledWith('/auth/logout',undefined,expect.objectContaining({timeout:5000}));
  });
  it('late profile writes cannot resurrect a signed-out account or replace a newer identity',async()=>{
    render(<AuthProvider><Probe/></AuthProvider>);await waitFor(()=>expect(screen.getByText(student.email)).toBeInTheDocument());
    const oldUpdate=profileUpdate;
    await act(async()=>fireEvent.click(screen.getByText('Logout')));
    await act(async()=>oldUpdate(student));
    expect(screen.getByText('Signed out')).toBeInTheDocument();
    await act(async()=>fireEvent.click(screen.getByText('Login')));
    await act(async()=>oldUpdate(student));
    expect(screen.getByText(sponsor.email)).toBeInTheDocument();
  });

  it('migrates a token saved by an older version into the HttpOnly cookie and forgets it',async()=>{
    localStorage.removeItem('lms_session_marker');localStorage.setItem('lms_token','legacy-token');
    mocks.post.mockResolvedValueOnce({data:{success:true,data:{established:true}}});
    render(<AuthProvider><Probe/></AuthProvider>);
    await waitFor(()=>expect(screen.getByText(student.email)).toBeInTheDocument());
    expect(mocks.post).toHaveBeenCalledWith('/auth/session',undefined,{headers:{Authorization:'Bearer legacy-token'}});
    expect(localStorage.getItem('lms_token')).toBeNull();
    expect(localStorage.getItem('lms_session_marker')).toBeTruthy();
  });
  it('a refused legacy token signs out without calling /auth/me',async()=>{
    localStorage.removeItem('lms_session_marker');localStorage.setItem('lms_token','revoked-token');
    mocks.post.mockRejectedValueOnce(new ApiRequestError({status:401,message:'Expired'}));
    render(<AuthProvider><Probe/></AuthProvider>);
    await waitFor(()=>expect(screen.getByText('Signed out')).toBeInTheDocument());
    expect(localStorage.getItem('lms_token')).toBeNull();expect(mocks.get).not.toHaveBeenCalled();
  });
  it('login keeps no token in browser storage',async()=>{
    render(<AuthProvider><Probe/></AuthProvider>);await waitFor(()=>expect(screen.getByText(student.email)).toBeInTheDocument());
    await act(async()=>fireEvent.click(screen.getByText('Login')));
    expect(JSON.stringify({...localStorage})).not.toContain('new-token');
  });
});
