import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/authService', () => ({
  authService: { forgotPassword: vi.fn(), resetPassword: vi.fn() },
}));
const logout = vi.fn(async () => undefined);
const login = vi.fn();
vi.mock('../../context/useAuth', () => ({ useAuth: () => ({ logout, login }) }));

import ResetPassword from '../../pages/ResetPassword';
import Login from '../../pages/Login';
import { authService } from '../../services/authService';

function WhereAmI() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<WhereAmI />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ResetPassword landing (UX-004)', () => {
  beforeEach(() => vi.mocked(authService.resetPassword).mockReset());

  it('after a reset, Login shows the success banner with the email filled in', async () => {
    vi.mocked(authService.resetPassword).mockResolvedValue(undefined);
    renderAt('/reset-password?token=abc123&email=learner%2B1%40example.com');

    await userEvent.type(screen.getByLabelText('New password'), 'new-password-1');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'new-password-1');
    await userEvent.click(screen.getByRole('button', { name: 'Set new password' }));

    expect(authService.resetPassword).toHaveBeenCalledWith('abc123', 'new-password-1');
    expect(await screen.findByText(/Password updated successfully/)).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('learner+1@example.com');
  });

  it('without a token, sends the learner to the email reset choice', async () => {
    renderAt('/reset-password');
    expect(await screen.findByTestId('where')).toHaveTextContent('/forgot-password?method=email');
  });

  it('"Request new link" goes to the email reset choice', () => {
    renderAt('/reset-password?token=abc123');
    expect(screen.getByRole('link', { name: 'Request new link' })).toHaveAttribute('href', '/forgot-password?method=email');
  });

  it('removes the token and email from the address bar once read', () => {
    window.history.replaceState(null, '', '/reset-password?token=abc123&email=learner%40example.com');
    renderAt('/reset-password?token=abc123&email=learner%40example.com');
    expect(window.location.search).toBe('');
    expect(screen.getByRole('button', { name: 'Set new password' })).toBeInTheDocument();
  });

  it('a link without an email (sent before this change) still lands on the success banner', async () => {
    vi.mocked(authService.resetPassword).mockResolvedValue(undefined);
    renderAt('/reset-password?token=abc123');
    await userEvent.type(screen.getByLabelText('New password'), 'new-password-1');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'new-password-1');
    await userEvent.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(await screen.findByText(/Password updated successfully/)).toBeInTheDocument();
  });
});
