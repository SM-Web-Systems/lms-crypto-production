import { render, screen } from '@testing-library/react-native';
import SubmissionsScreen from '@/app/(student)/submissions';
import { submissionsService } from '@/services/submissionsService';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('@/services/submissionsService', () => ({
  submissionsService: { getAll: jest.fn(), create: jest.fn(), download: jest.fn(), delete: jest.fn() },
}));
jest.mock('@/context/AuthContext', () => ({
  // An admin who also studies: the server would send them every submission they can grade.
  useAuth: () => ({ user: { id: 'admin-1', workspaces: ['student', 'admin'], permissions: ['course.view', 'course.submit', 'course.grade', 'course.delete'] } }),
}));

describe('My Submissions', () => {
  it("asks the server for the learner's own submissions only, even for staff who can grade", async () => {
    jest.mocked(submissionsService.getAll).mockResolvedValue({
      submissions: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    } as never);
    render(<SubmissionsScreen />);
    await screen.findByText(/submission/i);
    expect(submissionsService.getAll).toHaveBeenCalledWith(expect.objectContaining({ view: 'own' }));
    for (const call of jest.mocked(submissionsService.getAll).mock.calls) expect(call[0]).toMatchObject({ view: 'own' });
  });
});
