import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/authService', () => ({
  authService: { forgotPassword: vi.fn(), resetPassword: vi.fn() },
}));

import ForgotPassword from '../../pages/ForgotPassword';
import { authService } from '../../services/authService';

const mockForgot = vi.mocked(authService.forgotPassword);

function renderAt(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/forgot-password${search}`]}>
      <ForgotPassword />
    </MemoryRouter>,
  );
}

describe('ForgotPassword (UX-004)', () => {
  beforeEach(() => {
    mockForgot.mockReset();
  });

  it('asks how the learner signs in, with two labelled choices and no admin wording', () => {
    renderAt();
    expect(screen.getByRole('radiogroup', { name: 'How do you sign in?' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'With AmmaWallet' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'With my email and an LMS password' })).not.toBeChecked();
    expect(document.body.textContent).not.toMatch(/admin/i);
  });

  it('AmmaWallet choice links to the wallet reset in the same tab, with a way back', async () => {
    renderAt();
    await userEvent.click(screen.getByRole('radio', { name: 'With AmmaWallet' }));
    const link = screen.getByRole('link', { name: /reset password on ammawallet/i });
    expect(link).toHaveAttribute('href', 'https://ammawallet.com/forgot-password');
    expect(link).not.toHaveAttribute('target');
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
    expect(screen.queryByLabelText('Email')).toBeNull();
  });

  it('email choice moves focus to the email field and sends the LMS reset', async () => {
    mockForgot.mockResolvedValue(undefined);
    renderAt();
    await userEvent.click(screen.getByRole('radio', { name: 'With my email and an LMS password' }));

    const email = screen.getByLabelText('Email');
    expect(email).toHaveFocus();
    await userEvent.type(email, 'learner@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(mockForgot).toHaveBeenCalledWith('learner@example.com');
    expect(await screen.findByText('Check your email')).toBeInTheDocument();
  });

  it('shows the same neutral message for known and unknown emails', async () => {
    const messages: string[] = [];
    for (const address of ['known@example.com', 'unknown@example.com']) {
      mockForgot.mockResolvedValueOnce(undefined);
      const { unmount } = renderAt('?method=email');
      await userEvent.type(screen.getByLabelText('Email'), address);
      await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
      const status = await screen.findByRole('status');
      messages.push((status.textContent ?? '').replace(address, '<email>'));
      unmount();
    }
    expect(messages[0]).toBe(messages[1]);
    expect(messages[0]).toContain('If you usually sign in with AmmaWallet, choose that option instead.');
    expect(messages[0]).not.toMatch(/admin/i);
  });

  it.each(['?admin=true', '?method=email'])('%s preselects the email path', (search) => {
    renderAt(search);
    expect(screen.getByRole('radio', { name: 'With my email and an LMS password' })).toBeChecked();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('announces errors through an aria-live region', async () => {
    mockForgot.mockRejectedValue(new Error('Too many attempts. Please wait a moment and try again.'));
    renderAt('?method=email');
    await userEvent.type(screen.getByLabelText('Email'), 'learner@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Too many attempts');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
  });
});
