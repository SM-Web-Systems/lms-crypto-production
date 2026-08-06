import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/notificationService', () => ({
  notificationService: {
    broadcast: vi.fn(),
  },
}));

import { BroadcastPanel } from '../../components/BroadcastPanel';
import { notificationService } from '../../services/notificationService';

const mockBroadcast = (notificationService as any).broadcast as ReturnType<typeof vi.fn>;

describe('BroadcastPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBroadcast.mockResolvedValue({ sent: 5 });
  });

  it('renders form fields', () => {
    render(<BroadcastPanel />);
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toBeInTheDocument();
    expect(screen.getByLabelText('Target Audience')).toBeInTheDocument();
    expect(screen.getByText('Send Broadcast')).toBeInTheDocument();
  });

  it('sends broadcast and shows success', async () => {
    const user = userEvent.setup();
    render(<BroadcastPanel />);

    await user.type(screen.getByLabelText('Title'), 'System Update');
    await user.type(screen.getByLabelText('Message'), 'Scheduled maintenance tonight.');
    await user.click(screen.getByText('Send Broadcast'));

    await waitFor(() => {
      expect(mockBroadcast).toHaveBeenCalledWith('System Update', 'Scheduled maintenance tonight.', 'all');
      expect(screen.getByText('Broadcast sent to 5 users')).toBeInTheDocument();
    });
  });

  it('shows error on failure', async () => {
    const user = userEvent.setup();
    mockBroadcast.mockRejectedValue(new Error('fail'));
    render(<BroadcastPanel />);

    await user.type(screen.getByLabelText('Title'), 'Test');
    await user.type(screen.getByLabelText('Message'), 'Body');
    await user.click(screen.getByText('Send Broadcast'));

    await waitFor(() => {
      expect(screen.getByText('Failed to send broadcast')).toBeInTheDocument();
    });
  });

  it('allows selecting a target audience', async () => {
    const user = userEvent.setup();
    render(<BroadcastPanel />);

    const select = screen.getByLabelText('Target Audience');
    await user.selectOptions(select, 'student');

    await user.type(screen.getByLabelText('Title'), 'Students Only');
    await user.type(screen.getByLabelText('Message'), 'For students.');
    await user.click(screen.getByText('Send Broadcast'));

    await waitFor(() => {
      expect(mockBroadcast).toHaveBeenCalledWith('Students Only', 'For students.', 'student');
    });
  });
});
