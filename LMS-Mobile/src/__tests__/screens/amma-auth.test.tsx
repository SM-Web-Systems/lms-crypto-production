import React from 'react';
import { Linking } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import SignInScreen from '@/app/(auth)/sign-in';
import SignUpScreen from '@/app/(auth)/sign-up';
import ForgotPasswordScreen from '@/app/(auth)/forgot-password';

const mockWalletLogin = jest.fn(), mockLogin = jest.fn(), mockReplace = jest.fn();
jest.mock('@/context/AuthContext', () => ({useAuth: () => ({
  loginWithAmma: mockWalletLogin, login: mockLogin, sessionNotice: null,
})}));
jest.mock('expo-router', () => ({Link: 'Link',useRouter: () => ({replace: mockReplace})}));
jest.mock('expo-web-browser', () => ({openAuthSessionAsync: jest.fn()}));

beforeEach(() => {
  jest.clearAllMocks();
  mockWalletLogin.mockResolvedValue({id:'wallet-user'});
  jest.spyOn(Linking,'openURL').mockResolvedValue(undefined);
});

describe('Amma Wallet is the mobile account authority', () => {
  it('offers wallet sign-in first and hides local credentials until explicitly requested', async () => {
    render(<SignInScreen/>);
    expect(screen.queryByLabelText('Password')).toBeNull();
    fireEvent.press(screen.getByText('Sign in with AmmaWallet'));
    await waitFor(() => expect(mockWalletLogin).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(mockLogin).not.toHaveBeenCalled();
  },15000);
  it('retains the internal account login under an explicit disclosure', () => {
    render(<SignInScreen/>);
    fireEvent.press(screen.getByText('Administrator / internal sign in'));
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });
  it('shows wallet failures without falling back to local registration', async () => {
    mockWalletLogin.mockRejectedValueOnce(new Error('Wallet unavailable. Please try again.'));
    render(<SignInScreen/>);fireEvent.press(screen.getByText('Sign in with AmmaWallet'));
    await waitFor(() => expect(screen.getByText('Wallet unavailable. Please try again.')).toBeTruthy());
    expect(mockLogin).not.toHaveBeenCalled();expect(mockReplace).not.toHaveBeenCalled();
  });
  it('creates accounts on Amma Wallet without collecting another password', async () => {
    render(<SignUpScreen/>);
    expect(screen.queryByLabelText('Password')).toBeNull();
    fireEvent.press(screen.getByText('Create AmmaWallet account'));
    await waitFor(() => expect(Linking.openURL).toHaveBeenCalledWith('https://ammawallet.com/register?source=lms'));
  });
  it('directs wallet recovery to Amma Wallet rather than requesting an LMS reset', async () => {
    render(<ForgotPasswordScreen/>);
    expect(screen.queryByLabelText('Email')).toBeNull();
    fireEvent.press(screen.getByText('Recover AmmaWallet account'));
    await waitFor(() => expect(Linking.openURL).toHaveBeenCalledWith('https://ammawallet.com/forgot-password'));
  });
});
