import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../services/courseCompletionService', () => ({
  courseCompletionService: { getPricing: vi.fn(async () => ({ priceCents: 0, isFree: true, currency: 'ZAR', paymentMethods: [] })), getMyPayments: vi.fn(async () => []) },
}));

import CertEligibilitySection from '../../components/dashboard/CertEligibilitySection';

const course = { id: 'c1', title: 'Dummy course', courseCode: 'C1', sections: [] } as never;
const progress = { c1: { completedLessonItems: 7, totalLessonItems: 11, lessonPercentage: 64, requiredQuizzes: [], allRequiredQuizzesPassed: true,
  hasApprovedSubmission: true, meetsAllRequirements: true, canApplyForCertificate: true } } as never;

function renderWith(wallet: string | null) {
  return render(<MemoryRouter><CertEligibilitySection userWalletAddress={wallet} courses={[course]} coursesLoading={false}
    progressMap={progress} appStatusMap={{ c1: null }} onAppStatusChange={() => {}} /></MemoryRouter>);
}

describe('certificate section without a Stellar wallet', () => {
  it('prompts the learner to create a Stellar wallet before requesting a certificate', () => {
    renderWith(null);
    expect(screen.getByText("You don't have a Stellar wallet yet")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Create a Stellar wallet in AmmaWallet/ })).toHaveAttribute('href', 'https://ammawallet.com/onboarding');
  });
  it('shows no prompt when the learner has a wallet', () => {
    renderWith('GADDRESS');
    expect(screen.queryByText("You don't have a Stellar wallet yet")).not.toBeInTheDocument();
  });
});
