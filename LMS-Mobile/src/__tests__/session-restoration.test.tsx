import React from 'react';
import {Text,Pressable,AppState} from 'react-native';
import {render,screen,waitFor,fireEvent,act} from '@testing-library/react-native';
import {AuthProvider,useAuth} from '@/context/AuthContext';
import {SessionBoundary} from '@/components/SessionBoundary';
import {authService} from '@/services/authService';
import {ammaWalletService} from '@/services/ammaWalletService';
import {getStoredToken,setStoredToken,clearStoredToken} from '@/lib/token';
import {ApiRequestError} from '@/utils/apiError';
import {mobileHome} from '@/utils/authorization';
import type {User} from '@/types/api';

let mockToken:string|null='saved-token';
let mockUnauthorized:(token:string)=>void;
jest.mock('@/lib/api',()=>({__esModule:true,default:{post:jest.fn().mockResolvedValue({})},setTokenGetter:jest.fn(),onUnauthorized:jest.fn((listener)=>{mockUnauthorized=listener;return jest.fn();})}));
jest.mock('@/services/authService');
jest.mock('@/services/ammaWalletService',()=>({ammaWalletService:{signIn:jest.fn(),cancelSignIn:jest.fn()}}));
jest.mock('@/lib/token',()=>({getStoredToken:jest.fn(()=>Promise.resolve(mockToken)),setStoredToken:jest.fn(async(token)=>{mockToken=token;return true;}),clearStoredToken:jest.fn(async()=>{mockToken=null;})}));
const service=authService as jest.Mocked<typeof authService>;
const student:User={id:'student',name:'Learner',email:'student@example.invalid',role:'student',workspaces:['student'],defaultWorkspace:'student',permissions:['course.view','course.submit']};
const sponsor:User={...student,id:'sponsor',email:'sponsor@example.invalid',workspaces:['sponsor'],defaultWorkspace:'sponsor',permissions:['cohort.view_own']};
let profileUpdate:(user:User)=>void;
function Probe(){
  const auth=useAuth();profileUpdate=auth.updateUser;
  return <>
    <Text>{auth.user?auth.user.email:'Signed out'}</Text><Text>{mobileHome(auth.user)}</Text>
    {auth.sessionNotice?<Text>{auth.sessionNotice}</Text>:null}
    <Pressable onPress={()=>auth.login('sponsor@example.invalid','password')}><Text>Login</Text></Pressable>
    <Pressable onPress={()=>auth.loginWithAmma().catch(()=>{})}><Text>Wallet login</Text></Pressable>
    <Pressable onPress={()=>auth.logout()}><Text>Logout</Text></Pressable>
    <Pressable onPress={()=>auth.refresh()}><Text>Refresh</Text></Pressable>
  </>;
}
function renderSession(){return render(<AuthProvider><SessionBoundary><Probe/></SessionBoundary></AuthProvider>);}
beforeEach(()=>{
  jest.clearAllMocks();mockToken='saved-token';
  (getStoredToken as jest.Mock).mockImplementation(()=>Promise.resolve(mockToken));
  (setStoredToken as jest.Mock).mockImplementation(async(token)=>{mockToken=token;return true;});
  service.getMe.mockResolvedValue(student);service.login.mockResolvedValue({token:'new-token',user:sponsor});
  jest.spyOn(AppState,'addEventListener').mockReturnValue({remove:jest.fn()});
});

describe('A14 resilient native sessions',()=>{
  it('establishes the wallet session with the effective authorization returned by the API',async()=>{
    mockToken=null;
    (ammaWalletService.signIn as jest.Mock).mockResolvedValueOnce({token:'wallet-token',user:sponsor});
    renderSession();await waitFor(()=>expect(screen.getByText('Signed out')).toBeTruthy());
    await act(async()=>fireEvent.press(screen.getByText('Wallet login')));
    await waitFor(()=>expect(screen.getByText(sponsor.email)).toBeTruthy());
    expect(mockToken).toBe('wallet-token');expect(screen.getByText('/workspace')).toBeTruthy();
  });
  it('does not restore a wallet result after local logout',async()=>{
    mockToken=null;
    let complete!:(value:unknown)=>void;
    (ammaWalletService.signIn as jest.Mock).mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
    renderSession();await waitFor(()=>expect(screen.getByText('Signed out')).toBeTruthy());
    fireEvent.press(screen.getByText('Wallet login'));
    await act(async()=>fireEvent.press(screen.getByText('Logout')));
    await act(async()=>complete({token:'late-wallet-token',user:sponsor}));
    expect(mockToken).toBeNull();expect(screen.getByText('Signed out')).toBeTruthy();
    expect(setStoredToken).not.toHaveBeenCalled();expect(ammaWalletService.cancelSignIn).toHaveBeenCalled();
  });
  it('does not rehydrate the previous identity when the browser foregrounds during wallet sign-in',async()=>{
    let complete!:(value:unknown)=>void;
    (ammaWalletService.signIn as jest.Mock).mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
    renderSession();await waitFor(()=>expect(screen.getByText(student.email)).toBeTruthy());
    fireEvent.press(screen.getByText('Wallet login'));
    const reads=service.getMe.mock.calls.length;
    const listener=(AppState.addEventListener as jest.Mock).mock.calls[0][1];
    await act(async()=>listener('active'));
    expect(service.getMe).toHaveBeenCalledTimes(reads);
    await act(async()=>complete({token:'wallet-token',user:sponsor}));
    expect(mockToken).toBe('wallet-token');
  });
  it('restores an authoritative session',async()=>{
    renderSession();await waitFor(()=>expect(screen.getByText(student.email)).toBeTruthy());
    expect(clearStoredToken).not.toHaveBeenCalled();
  });
  it.each([
    new ApiRequestError({status:503,message:'Server unavailable'}),
    new ApiRequestError({message:'Request timed out'}),
    new ApiRequestError({message:'Airplane mode'}),
  ])('keeps recoverable credentials and retries a startup failure: %s',async(error)=>{
    service.getMe.mockRejectedValueOnce(error);
    renderSession();await waitFor(()=>expect(screen.getByText('Reconnect to your account')).toBeTruthy());
    expect(clearStoredToken).not.toHaveBeenCalled();expect(mockToken).toBe('saved-token');
    fireEvent.press(screen.getByText('Try again'));
    await waitFor(()=>expect(screen.getByText(student.email)).toBeTruthy());
  });
  it('clears an expired or revoked startup token',async()=>{
    service.getMe.mockRejectedValueOnce(new ApiRequestError({status:401,message:'Revoked'}));
    renderSession();await waitFor(()=>expect(screen.getByText('Signed out')).toBeTruthy());
    expect(mockToken).toBeNull();expect(screen.getByText(/expired or was revoked/)).toBeTruthy();
  });
  it('centrally clears a later unauthorized request',async()=>{
    renderSession();await waitFor(()=>expect(screen.getByText(student.email)).toBeTruthy());
    await act(async()=>mockUnauthorized('saved-token'));
    await waitFor(()=>expect(screen.getByText('Signed out')).toBeTruthy());
    expect(mockToken).toBeNull();
  });
  it('retains the active user on transient refresh failure and refreshes role context on foreground',async()=>{
    renderSession();await waitFor(()=>expect(screen.getByText(student.email)).toBeTruthy());
    service.getMe.mockRejectedValueOnce(new ApiRequestError({status:503,message:'Unavailable'}));
    await act(async()=>fireEvent.press(screen.getByText('Refresh')));
    expect(screen.getByText(student.email)).toBeTruthy();expect(mockToken).toBe('saved-token');
    service.getMe.mockResolvedValueOnce(sponsor);
    const listener=(AppState.addEventListener as jest.Mock).mock.calls[0][1];
    await act(async()=>listener('active'));
    await waitFor(()=>expect(screen.getByText('/workspace')).toBeTruthy());
  });
  it('a late old hydration or 401 cannot overwrite a newer login',async()=>{
    let resolve!:(value:User)=>void;
    renderSession();await waitFor(()=>expect(screen.getByText(student.email)).toBeTruthy());
    service.getMe.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
    fireEvent.press(screen.getByText('Refresh'));
    await waitFor(()=>expect(service.getMe).toHaveBeenCalledTimes(2));
    await act(async()=>fireEvent.press(screen.getByText('Login')));
    await waitFor(()=>expect(screen.getByText(sponsor.email)).toBeTruthy());
    await act(async()=>{resolve(student);mockUnauthorized('saved-token');});
    expect(screen.getByText(sponsor.email)).toBeTruthy();expect(mockToken).toBe('new-token');
  });
  it('a restore completing after sign-out cannot resurrect the user',async()=>{
    let resolve!:(value:User)=>void;
    renderSession();await waitFor(()=>expect(screen.getByText(student.email)).toBeTruthy());
    service.getMe.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
    fireEvent.press(screen.getByText('Refresh'));
    await waitFor(()=>expect(service.getMe).toHaveBeenCalledTimes(2));
    await act(async()=>fireEvent.press(screen.getByText('Logout')));
    await act(async()=>resolve(student));
    expect(screen.getByText('Signed out')).toBeTruthy();expect(mockToken).toBeNull();
  });
  it('keeps an in-memory login when secure persistence fails and explains it',async()=>{
    (setStoredToken as jest.Mock).mockImplementationOnce(async(token)=>{mockToken=token;return false;});
    renderSession();await waitFor(()=>expect(screen.getByText(student.email)).toBeTruthy());
    await act(async()=>fireEvent.press(screen.getByText('Login')));
    expect(screen.getByText(sponsor.email)).toBeTruthy();expect(screen.getByText(/could not save the session/)).toBeTruthy();
  });
  it('does not interpret a secure-storage read error as an absent session',async()=>{
    (getStoredToken as jest.Mock).mockRejectedValueOnce(new Error('Device storage locked'));
    renderSession();await waitFor(()=>expect(screen.getByText('Reconnect to your account')).toBeTruthy());
    expect(clearStoredToken).not.toHaveBeenCalled();
  });
  it('a late profile save cannot restore an identity after logout or replace newer permissions',async()=>{
    renderSession();await waitFor(()=>expect(screen.getByText(student.email)).toBeTruthy());
    const oldUpdate=profileUpdate;
    await act(async()=>fireEvent.press(screen.getByText('Logout')));
    await act(async()=>oldUpdate({...student,name:'Late profile'}));
    expect(screen.getByText('Signed out')).toBeTruthy();
    await act(async()=>fireEvent.press(screen.getByText('Login')));
    await act(async()=>oldUpdate(student));
    expect(screen.getByText(sponsor.email)).toBeTruthy();
  });

  it('offers a retry when clearing saved credentials fails',async()=>{
    renderSession();await waitFor(()=>expect(screen.getByText(student.email)).toBeTruthy());
    (clearStoredToken as jest.Mock).mockRejectedValueOnce(new Error('Storage locked'));
    await act(async()=>fireEvent.press(screen.getByText('Logout')));
    expect(screen.getByText('Retry clearing saved session')).toBeTruthy();
    await act(async()=>fireEvent.press(screen.getByText('Retry clearing saved session')));
    await waitFor(()=>expect(screen.queryByText('Retry clearing saved session')).toBeNull());
    expect(mockToken).toBeNull();
  });

});
