import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import DashboardScreen from '@/app/(student)/dashboard';

const offline = 'Unable to reach the server. Check your internet connection and try again.';
let mockAuth: Record<string, unknown> = {};
const mockGetAll = jest.fn();

jest.mock('@/context/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock('@/components/AnnouncementsPanel', () => ({ AnnouncementsPanel: () => null }));
jest.mock('@/services/submissionsService', () => ({ submissionsService: { getAll: (...args: unknown[]) => mockGetAll(...args) } }));
jest.mock('@/services/quizService', () => ({ quizService: { getCompletionsForUser: jest.fn(async () => []) } }));
jest.mock('@/utils/apiError', () => ({ getErrorMessage: (e: Error) => e.message }));

const base = { user: { id: 'u', name: 'Learner' }, logout: jest.fn(), refresh: jest.fn() };

beforeEach(() => { mockGetAll.mockReset(); });

describe('Dashboard while offline', () => {
  it('leaves the offline message to the session banner instead of repeating it', async () => {
    mockAuth = { ...base, sessionError: offline };
    mockGetAll.mockRejectedValue(new Error(offline));
    render(<DashboardScreen />);
    await waitFor(() => expect(mockGetAll).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(offline)).toBeNull());
  });

  it('still shows its own error when it is not the session problem', async () => {
    mockAuth = { ...base, sessionError: null };
    mockGetAll.mockRejectedValue(new Error('Could not load your dashboard.'));
    render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByText('Could not load your dashboard.')).toBeTruthy());
  });

  it('reloads once the session reconnects', async () => {
    mockAuth = { ...base, sessionError: offline };
    mockGetAll.mockRejectedValueOnce(new Error(offline)).mockResolvedValue({ submissions: [] });
    const view = render(<DashboardScreen />);
    await waitFor(() => expect(mockGetAll).toHaveBeenCalledTimes(1));
    mockAuth = { ...base, sessionError: null };
    view.rerender(<DashboardScreen />);
    await waitFor(() => expect(mockGetAll).toHaveBeenCalledTimes(2));
  });
});
