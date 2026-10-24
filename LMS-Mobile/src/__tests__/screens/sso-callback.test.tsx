import React from 'react';
import {render, screen, waitFor} from '@testing-library/react-native';
import SsoCallbackScreen from '@/app/sso-callback';
import api from '@/lib/api';
import {ammaWalletService} from '@/services/ammaWalletService';

const mockReplace=jest.fn();
let mockSession={isAuthenticated:false,walletSignInPending:false,sessionNotice:null as string|null};
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockSession}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{post:jest.fn()}}));
jest.mock('@/services/ammaWalletService',()=>({ammaWalletService:{signIn:jest.fn()}}));
jest.mock('expo-router',()=>({Link:({children}:any)=>require('react').createElement(require('react-native').Text,null,children),useRouter:()=>({replace:mockReplace}),
  useLocalSearchParams:()=>({code:'a'.repeat(64),token:'unsolicited-token',state:'unsolicited-state'})}));
beforeEach(()=>{jest.clearAllMocks();mockSession={isAuthenticated:false,walletSignInPending:false,sessionNotice:null};});

it('a cold unsolicited callback offers restart without exchanging URL credentials',()=>{
  render(<SsoCallbackScreen/>);
  expect(screen.getByText(/If the app was closed during sign-in, please start again/)).toBeTruthy();
  expect(screen.getByText('Back to sign in')).toBeTruthy();
  expect(api.post).not.toHaveBeenCalled();expect(ammaWalletService.signIn).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
});
it('waits for the active proof-bound attempt before routing an already signed-in identity',()=>{
  mockSession={...mockSession,isAuthenticated:true,walletSignInPending:true};
  render(<SsoCallbackScreen/>);
  expect(screen.getByText('Completing sign-in…')).toBeTruthy();
  expect(mockReplace).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});
it('routes only an established session when the active attempt is finished',async()=>{
  mockSession={...mockSession,isAuthenticated:true};render(<SsoCallbackScreen/>);
  await waitFor(()=>expect(mockReplace).toHaveBeenCalledWith('/'));
  expect(api.post).not.toHaveBeenCalled();
});
