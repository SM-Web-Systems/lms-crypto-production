import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import OnboardingChecklist from '../../components/dashboard/OnboardingChecklist';

const baseProps = {
  userId: 'user-1',
  walletConnected: false,
  enrolled: false,
  hasCompletedLesson: false,
  quizPassed: false,
  hasApplied: false,
};

describe('OnboardingChecklist', () => {
  it('renders all five steps', () => {
    render(<OnboardingChecklist {...baseProps} />);
    expect(screen.getByText('Connect your AmmaWallet')).toBeInTheDocument();
    expect(screen.getByText('Enrol in a course')).toBeInTheDocument();
    expect(screen.getByText('Complete your first lesson')).toBeInTheDocument();
    expect(screen.getByText('Pass the required quiz')).toBeInTheDocument();
    expect(screen.getByText('Apply for your certificate')).toBeInTheDocument();
  });

  it('shows "Done" labels for completed steps', () => {
    render(<OnboardingChecklist {...baseProps} walletConnected enrolled />);
    const doneLabels = screen.getAllByText('Done');
    expect(doneLabels).toHaveLength(2);
  });

  it('shows completion message when all steps done', () => {
    render(
      <OnboardingChecklist
        {...baseProps}
        walletConnected
        enrolled
        hasCompletedLesson
        quizPassed
        hasApplied
      />,
    );
    expect(screen.getByText(/completed all the steps/)).toBeInTheDocument();
  });

  it('dismisses and persists to localStorage', async () => {
    const user = userEvent.setup();
    render(<OnboardingChecklist {...baseProps} />);
    expect(screen.getByText('Getting started')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(screen.queryByText('Getting started')).not.toBeInTheDocument();
    expect(localStorage.getItem('lms_checklist_dismissed_user-1')).toBe('true');
  });

  it('stays hidden when previously dismissed', () => {
    localStorage.setItem('lms_checklist_dismissed_user-1', 'true');
    render(<OnboardingChecklist {...baseProps} />);
    expect(screen.queryByText('Getting started')).not.toBeInTheDocument();
  });
});
