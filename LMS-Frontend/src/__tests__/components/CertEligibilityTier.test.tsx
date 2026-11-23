// Staging bug 23: Re-apply after a rejection applied as a paid certificate and opened a learner payment,
// even for a learner whose sponsor cohort already paid, and never offered the free/verified choice.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
  getPricing: vi.fn(async () => ({ priceCents: 100, isFree: false, currency: 'USD', paymentMethods: [] })),
  getMyPayments: vi.fn(async () => []),
  getTiers: vi.fn(),
  applyForCertificate: vi.fn(),
  getCertificateBadgePreview: vi.fn(async () => null),
}));
vi.mock('../../services/courseCompletionService', () => ({ courseCompletionService: svc }));

import CertEligibilitySection from '../../components/dashboard/CertEligibilitySection';

const course = { id: 'c1', title: 'Dummy course', courseCode: 'C1', sections: [] } as never;
const progress = { c1: { completedLessonItems: 11, totalLessonItems: 11, lessonPercentage: 100, requiredQuizzes: [], allRequiredQuizzesPassed: true,
  hasApprovedSubmission: true, meetsAllRequirements: true, canApplyForCertificate: true } } as never;
const rejected = { c1: { applicationId: 'a0', courseId: 'c1', status: 'rejected', reviewNotes: 'Quiz missing' } } as never;

const renderIt = () => render(<MemoryRouter><CertEligibilitySection userWalletAddress="GADDRESS" courses={[course]} coursesLoading={false}
  progressMap={progress} appStatusMap={rejected} onAppStatusChange={() => {}} /></MemoryRouter>);

beforeEach(() => {
  svc.getTiers.mockReset(); svc.applyForCertificate.mockReset();
  svc.applyForCertificate.mockResolvedValue({ applicationId: 'a1', courseId: 'c1', status: 'pending' });
});

describe('re-applying for a certificate', () => {
  it('a sponsored learner re-applies for the cohort certificate without being asked or charged', async () => {
    svc.getTiers.mockResolvedValue({ tiersEnabled: 'both', priceCents: 100, currency: 'USD', isFree: false, sponsoredTier: 'paid' });
    renderIt();
    await userEvent.click(screen.getByRole('button', { name: /Re-apply/ }));
    await waitFor(() => expect(svc.applyForCertificate).toHaveBeenCalledWith('c1', 'paid'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks free or verified when both are offered and nobody sponsors the learner', async () => {
    svc.getTiers.mockResolvedValue({ tiersEnabled: 'both', priceCents: 100, currency: 'USD', isFree: false, sponsoredTier: null });
    renderIt();
    await userEvent.click(screen.getByRole('button', { name: /Re-apply/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(svc.applyForCertificate).not.toHaveBeenCalled();
  });
});
