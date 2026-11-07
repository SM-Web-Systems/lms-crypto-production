import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {AuthProvider} from '../context/AuthContext';
import {useAuth} from '../context/useAuth';
import {ApiRequestError} from '../utils/apiError';
import type {User} from '../types/api';

const mocks=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),unauthorized:undefined as undefined|((token:string)=>void)}));
vi.mock('../services/api',()=>({default:{get:mocks.get,post:mocks.post},setTokenGetter:vi.fn(),onUnauthorized:(listener:(token:string)=>void)=>{mocks.unauthorized=listener;return()=>{};}}));
const student:User={id:'student',name:'Learner',email:'student@example.invalid',walletAddress:null,walletLinkingStatus:'none',workspaces:['student'],permissions:['course.view']};
const sponsor:User={...student,id:'sponsor',email:'sponsor@example.invalid',workspaces:['sponsor']};
const response=(user:User)=>({data:{success:true,data:user}});
let profileUpdate:(user:User)=>void;
function Probe(){const auth=useAuth();profileUpdate=auth.updateUser;return <>
  <p>{auth.isLoading?'Loading':auth.user?.email||'Signed out'}</p>
  <button onClick={()=>auth.login('sponsor@example.invalid','password')}>Login</button>
  <button onClick={()=>auth.logout()}>Logout</button>
</>;}
beforeEach(()=>{vi.clearAllMocks();localStorage.setItem('lms_token','saved-token');mocks.get.mockResolvedValue(response(student));mocks.post.mockResolvedValue({data:{success:true,data:{user:sponsor,token:'new-token'}}});});

describe('A14 browser session recovery',()=>{
  it.each([new ApiRequestError({status:503,message:'Unavailable'}),new ApiRequestError({message:'Timeout'}),new Error('Network disconnected')])('retains a saved token during startup failure: %s',async(error)=>{
    mocks.get.mockRejectedValueOnce(error);render(<AuthProvider><Probe/></AuthProvider>);
    await waitFor(()=>expect(screen.getByText('Reconnect to your account')).toBeInTheDocument());
    expect(localStorage.getItem('lms_token')).toBe('saved-token');expect(screen.queryByText('Signed out')).toBeNull();
    await act(async()=>fireEvent.click(screen.getByText('Try again')));
    await waitFor(()=>expect(screen.getByText(student.email)).toBeInTheDocument());
  });
  it('invalid credentials clear the token and return to sign in',async()=>{
    mocks.get.mockRejectedValueOnce(new ApiRequestError({status:401,message:'Expired'}));render(<AuthProvider><Probe/></AuthProvider>);
    await waitFor(()=>expect(screen.getByText('Signed out')).toBeInTheDocument());expect(localStorage.getItem('lms_token')).toBeNull();
  });
  it('a later protected API 401 updates auth state centrally',async()=>{
    render(<AuthProvider><Probe/></AuthProvider>);await waitFor(()=>expect(screen.getByText(student.email)).toBeInTheDocument());
    await act(async()=>mocks.unauthorized?.('saved-token'));
    expect(screen.getByText('Signed out')).toBeInTheDocument();expect(localStorage.getItem('lms_token')).toBeNull();
  });
  it('a stale protected request cannot sign out a newer login',async()=>{
    render(<AuthProvider><Probe/></AuthProvider>);await waitFor(()=>expect(screen.getByText(student.email)).toBeInTheDocument());
    await act(async()=>fireEvent.click(screen.getByText('Login')));
    await act(async()=>mocks.unauthorized?.('saved-token'));
    expect(screen.getByText(sponsor.email)).toBeInTheDocument();expect(localStorage.getItem('lms_token')).toBe('new-token');
  });
  it('sign-out while hydration is in flight cannot restore the old user',async()=>{
    let resolve!:(value:ReturnType<typeof response>)=>void;
    render(<AuthProvider><Probe/></AuthProvider>);await waitFor(()=>expect(screen.getByText(student.email)).toBeInTheDocument());
    mocks.get.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));fireEvent(window,new Event('focus'));
    await waitFor(()=>expect(mocks.get).toHaveBeenCalledTimes(2));
    await act(async()=>fireEvent.click(screen.getByText('Logout')));
    await act(async()=>resolve(response(student)));
    expect(screen.getByText('Signed out')).toBeInTheDocument();
    expect(mocks.post).toHaveBeenCalledWith('/auth/logout',undefined,expect.objectContaining({headers:{Authorization:'Bearer saved-token'}}));
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

});
