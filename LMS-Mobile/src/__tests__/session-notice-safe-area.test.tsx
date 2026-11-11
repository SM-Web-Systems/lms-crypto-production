import React from 'react';
import { Text } from 'react-native';
import { render, screen, within } from '@testing-library/react-native';
import { SessionBoundary } from '@/components/SessionBoundary';

let mockAuth: Record<string, unknown> = {};
jest.mock('@/context/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('@/components/OfflineLearningPanel', () => ({ OfflineLearningPanel: () => null }));

const base = { isLoading: false, refresh: jest.fn(), logout: jest.fn(), storageWarning: null };

describe('SessionBoundary notices and the status bar', () => {
  it('keeps the signed-in reconnect banner inside a top safe area', () => {
    mockAuth = { ...base, user: { id: 'u' }, sessionError: 'Unable to reach the server. Check your internet connection and try again.' };
    render(<SessionBoundary><Text>Screen</Text></SessionBoundary>);
    const notices = screen.getByTestId('session-notices');
    // react-native-safe-area-context normalises edges={['top']} to this shape.
    expect(notices.props.edges).toMatchObject({ top: 'additive', bottom: 'off' });
    expect(within(notices).getByText(/Unable to reach the server/)).toBeTruthy();
    expect(screen.getByText('Screen')).toBeTruthy();
  });

  it('keeps a storage warning inside the same safe area', () => {
    mockAuth = { ...base, user: { id: 'u' }, sessionError: null, storageWarning: 'Saved session could not be cleared.' };
    render(<SessionBoundary><Text>Screen</Text></SessionBoundary>);
    expect(within(screen.getByTestId('session-notices')).getByText(/could not be cleared/)).toBeTruthy();
  });

  it('adds no safe-area block when there is nothing to show', () => {
    mockAuth = { ...base, user: { id: 'u' }, sessionError: null };
    render(<SessionBoundary><Text>Screen</Text></SessionBoundary>);
    expect(screen.queryByTestId('session-notices')).toBeNull();
  });
});
