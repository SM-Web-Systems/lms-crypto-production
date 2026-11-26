/** Lecturer certificates page: decide applications for own courses; payment and issuing stay with admins. */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/adminCertificateService', () => ({
  adminCertificateService: {
    getAllCertificates: vi.fn(), approveApplication: vi.fn(), rejectApplication: vi.fn(),
    confirmPayment: vi.fn(), waivePayment: vi.fn(), mintApplication: vi.fn(), getIssuedCredentials: vi.fn(),
  },
}));
vi.mock('../../services/courseCompletionService', () => ({ courseCompletionService: { getStudentProgress: vi.fn() } }));

import { adminCertificateService } from '../../services/adminCertificateService';
import LecturerCertificates from '../../pages/LecturerCertificates';

const list = adminCertificateService.getAllCertificates as unknown as ReturnType<typeof vi.fn>;
const app = (over: Record<string, unknown>) => ({
  applicationId: 'a1', userId: 'u1', userName: 'Learner 05', userEmail: 'l5@test.com', courseId: 'c1', courseName: 'Test course',
  walletAddress: 'GABC', status: 'pending', appliedAt: '2026-11-25 15:00:00', reviewedAt: null, reviewedBy: null, reviewNotes: null,
  lecturerRecommendation: null, txHash: null, selectedTier: 'paid', paymentStatus: 'pending', paymentId: 'p1', priceCents: 100, ...over,
});

describe('LecturerCertificates', () => {
  beforeEach(() => list.mockReset());

  it('lets the lecturer approve or reject a pending application', async () => {
    list.mockResolvedValue([app({})]);
    render(<MemoryRouter><LecturerCertificates /></MemoryRouter>);
    expect(await screen.findByText('Learner 05')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });

  it('shows no payment or issue buttons on an approved paid application', async () => {
    list.mockResolvedValue([app({ applicationId: 'a2', status: 'approved' })]);
    render(<MemoryRouter><LecturerCertificates /></MemoryRouter>);
    expect(await screen.findByText(/An administrator confirms payment and issues the certificate/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Confirm Payment/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Waive$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Issue certificate/ })).not.toBeInTheDocument();
  });
});
