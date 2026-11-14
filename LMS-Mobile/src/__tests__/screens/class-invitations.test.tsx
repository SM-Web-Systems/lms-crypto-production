import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ClassInvitationsCard } from '@/components/ClassInvitationsCard';
import { classInvitationService } from '@/services/classInvitationService';
import { ApiRequestError } from '@/utils/apiError';

jest.mock('@/services/classInvitationService', () => ({ classInvitationService: { mine: jest.fn(), respond: jest.fn() } }));
const svc = classInvitationService as jest.Mocked<typeof classInvitationService>;
const invitation = { id: 'i-1', className: 'Maths', invitedBy: 'Ms Teacher', createdAt: 'x' };

beforeEach(() => jest.clearAllMocks());

describe('class invitations on the dashboard', () => {
  it('shows nothing when there are no invitations', async () => {
    svc.mine.mockResolvedValue([]);
    render(<ClassInvitationsCard />);
    await waitFor(() => expect(svc.mine).toHaveBeenCalled());
    expect(screen.queryByText('Class invitations')).toBeNull();
  });

  it('joins a class and refreshes the list', async () => {
    svc.mine.mockResolvedValueOnce([invitation]).mockResolvedValue([]);
    svc.respond.mockResolvedValue(undefined);
    render(<ClassInvitationsCard />);
    expect(await screen.findByText(/invited you to the class Maths/)).toBeTruthy();
    fireEvent.press(screen.getByText('Join'));
    await waitFor(() => expect(svc.respond).toHaveBeenCalledWith('i-1', true));
    await waitFor(() => expect(screen.queryByText(/Maths/)).toBeNull());
  });

  it('declines when asked', async () => {
    svc.mine.mockResolvedValueOnce([invitation]).mockResolvedValue([]);
    svc.respond.mockResolvedValue(undefined);
    render(<ClassInvitationsCard />);
    fireEvent.press(await screen.findByText('Decline'));
    await waitFor(() => expect(svc.respond).toHaveBeenCalledWith('i-1', false));
  });

  it('keeps the invitation and says what went wrong', async () => {
    svc.mine.mockResolvedValue([invitation]);
    svc.respond.mockRejectedValue(new ApiRequestError({ message: 'Invitation not found or already answered.', status: 404 }));
    render(<ClassInvitationsCard />);
    fireEvent.press(await screen.findByText('Join'));
    expect(await screen.findByText('Invitation not found or already answered.')).toBeTruthy();
  });
});
