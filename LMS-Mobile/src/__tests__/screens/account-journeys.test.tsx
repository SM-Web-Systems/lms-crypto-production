import React from 'react';
import {Linking} from 'react-native';
import {render,screen,fireEvent,waitFor} from '@testing-library/react-native';
import WorkspaceScreen from '@/app/workspace';
import AccountScreen from '@/app/account';
import ForgotPasswordScreen from '@/app/(auth)/internal-forgot-password';
import ResetPasswordScreen from '@/app/(auth)/reset-password';
import {accountService} from '@/services/accountService';
import {authService} from '@/services/authService';
import {canStudy,mobileHome,canOpenStudentPath} from '@/utils/authorization';
import {webUrl} from '@/utils/webHandoff';
import type {User} from '@/types/api';

let mockUser:User|null;
const mockLogout=jest.fn().mockResolvedValue(undefined),mockRefresh=jest.fn().mockResolvedValue(undefined),mockUpdate=jest.fn();
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser,isLoading:false,isAuthenticated:!!mockUser,logout:mockLogout,refresh:mockRefresh,updateUser:mockUpdate})}));
jest.mock('@/services/accountService');jest.mock('@/services/authService');
const service=accountService as jest.Mocked<typeof accountService>,auth=authService as jest.Mocked<typeof authService>;
const student:User={id:'student',name:'Learner',email:'student@example.invalid',role:'student',workspaces:['student'],defaultWorkspace:'student',permissions:['course.view','course.submit','certificate.view_own']};
beforeEach(()=>{
  jest.clearAllMocks();mockUser=student;service.sessions.mockResolvedValue([]);service.exports.mockResolvedValue([]);service.deletionStatus.mockResolvedValue({status:'none'});
  service.requestDeletion.mockResolvedValue(undefined);service.cancelDeletion.mockResolvedValue(undefined);service.revokeSession.mockResolvedValue(undefined);service.requestExport.mockResolvedValue(undefined);
  auth.forgotPassword.mockResolvedValue(undefined);auth.resetPassword.mockResolvedValue(undefined);
});

describe('A13 role-aware handoffs',()=>{
  it.each(['sponsor','lecturer','teaching-assistant','employer','parent','teacher','admin'] as const)('does not treat %s with a legacy student role as native student access',(workspace)=>{
    const user={...student,workspaces:[workspace],defaultWorkspace:workspace,permissions:[]};
    expect(canStudy(user)).toBe(false);expect(mobileHome(user)).toBe('/workspace');
  });
  it('legacy admin with effective student access can study; legacy student alone confers no access',()=>{
    expect(canStudy({...student,role:'admin'})).toBe(true);
    expect(canStudy({...student,workspaces:undefined})).toBe(false);
    expect(canOpenStudentPath({...student,permissions:['course.view']},'/submissions')).toBe(false);
  });
  it('multi-role accounts retain a native student option and the correct sponsor web destination',async()=>{
    mockUser={...student,workspaces:['sponsor','student'],defaultWorkspace:'sponsor'};
    expect(mobileHome(mockUser)).toBe('/workspace');render(<WorkspaceScreen/>);
    expect(screen.getByText('Continue student learning')).toBeTruthy();
    jest.spyOn(Linking,'openURL').mockResolvedValueOnce(undefined);
    fireEvent.press(screen.getByText('Open sponsorship on web'));
    await waitFor(()=>expect(Linking.openURL).toHaveBeenCalledWith('https://lms.smwebsystems.com/sponsor'));
  });
  it('shows an empty-access explanation and refuses external or script handoff paths',()=>{
    mockUser={...student,workspaces:[],permissions:[]};render(<WorkspaceScreen/>);
    expect(screen.getByText(/No workspace is currently assigned/)).toBeTruthy();
    for(const path of ['//evil.invalid','javascript:alert(1)','/\\evil.invalid'])expect(()=>webUrl(path)).toThrow();
    expect(webUrl('/student/payments')).not.toMatch(/token|Bearer/);
  });
  it('routes pending deletion to account management',()=>{
    expect(mobileHome({...student,deletionStatus:'pending_deletion'})).toBe('/account');
  });
});

describe('native account controls',()=>{
  it('loads independent sections even when session loading fails',async()=>{
    service.sessions.mockRejectedValueOnce(new Error('Sessions offline'));
    render(<AccountScreen/>);
    await waitFor(()=>expect(screen.getByText('Sessions offline')).toBeTruthy());
    expect(screen.getByText('No recent data exports.')).toBeTruthy();expect(screen.getByText('Request account deletion')).toBeTruthy();
  });
  it('requires the exact deletion confirmation before creating a request',async()=>{
    render(<AccountScreen/>);await waitFor(()=>expect(screen.getByLabelText('Deletion confirmation')).toBeTruthy());
    fireEvent.press(screen.getByText('Request account deletion'));expect(service.requestDeletion).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText('Deletion confirmation'),'DELETE MY ACCOUNT');
    fireEvent.press(screen.getByText('Request account deletion'));
    await waitFor(()=>expect(service.requestDeletion).toHaveBeenCalledWith('DELETE MY ACCOUNT'));
    await waitFor(()=>expect(mockRefresh).toHaveBeenCalled());
  });
  it('cancels pending deletion and refreshes authorization',async()=>{
    mockUser={...student,deletionStatus:'pending_deletion'};service.deletionStatus.mockResolvedValue({status:'pending',gracePeriodEndsAt:'2026-11-22'});
    render(<AccountScreen/>);await waitFor(()=>expect(screen.getByText('Cancel account deletion')).toBeTruthy());
    fireEvent.press(screen.getByText('Cancel account deletion'));
    await waitFor(()=>expect(service.cancelDeletion).toHaveBeenCalledTimes(1));
    await waitFor(()=>expect(mockRefresh).toHaveBeenCalled());
  });
  it('revokes the current session only after confirmation and signs out',async()=>{
    service.sessions.mockResolvedValue([{id:'session',current:true,user_agent:'Phone',ip_address:null,created_at:'now',last_active:'now',expires_at:'later'}]);
    render(<AccountScreen/>);await waitFor(()=>expect(screen.getByText('Sign out this device')).toBeTruthy());
    fireEvent.press(screen.getByText('Sign out this device'));expect(service.revokeSession).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Confirm revoke'));
    await waitFor(()=>expect(service.revokeSession).toHaveBeenCalledWith('session'));
    await waitFor(()=>expect(mockLogout).toHaveBeenCalledTimes(1));
  });
  it('shows pending export status and only offers download for a ready archive',async()=>{
    service.exports.mockResolvedValue([{id:'export',status:'processing',created_at:'now',completed_at:null,error:null}]);
    render(<AccountScreen/>);await waitFor(()=>expect(screen.getByText(/now · processing/)).toBeTruthy());
    expect(screen.queryByText('Download data export')).toBeNull();
    service.exports.mockResolvedValue([{id:'export',status:'ready',created_at:'now',completed_at:'now',error:null}]);
    fireEvent.press(screen.getByText('Refresh export status'));
    await waitFor(()=>expect(screen.getByText('Download data export')).toBeTruthy());
  });
});

describe('native internal-account password recovery',()=>{
  it('validates email and gives a generic recovery response',async()=>{
    render(<ForgotPasswordScreen/>);fireEvent.press(screen.getByText('Send reset link'));
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Email'),'learner@example.invalid');fireEvent.press(screen.getByText('Send reset link'));
    await waitFor(()=>expect(screen.getByText(/If that email matches an account/)).toBeTruthy());
    expect(auth.forgotPassword).toHaveBeenCalledWith('learner@example.invalid');
  });
  it('accepts the email reset link, validates matching passwords and requires sign-in after success',async()=>{
    render(<ResetPasswordScreen/>);
    fireEvent.changeText(screen.getByLabelText('Reset link or token'),'https://lms.smwebsystems.com/reset-password?token=private-reset-token');
    fireEvent.changeText(screen.getByLabelText('New password'),'new-password');
    fireEvent.changeText(screen.getByLabelText('Confirm new password'),'different');
    fireEvent.press(screen.getByText('Update password'));expect(screen.getByText('Passwords do not match.')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Confirm new password'),'new-password');fireEvent.press(screen.getByText('Update password'));
    await waitFor(()=>expect(auth.resetPassword).toHaveBeenCalledWith('private-reset-token','new-password'));
    await waitFor(()=>expect(screen.getByText(/Password updated/)).toBeTruthy());expect(mockLogout).toHaveBeenCalled();
  });
  it('keeps an expired reset failure visible and offers a new reset link',async()=>{
    auth.resetPassword.mockRejectedValueOnce(new Error('Reset link expired'));
    render(<ResetPasswordScreen/>);
    fireEvent.changeText(screen.getByLabelText('Reset link or token'),'expired-token');fireEvent.changeText(screen.getByLabelText('New password'),'new-password');fireEvent.changeText(screen.getByLabelText('Confirm new password'),'new-password');fireEvent.press(screen.getByText('Update password'));
    await waitFor(()=>expect(screen.getByText('Reset link expired')).toBeTruthy());expect(mockLogout).not.toHaveBeenCalled();
  });
});
