/**
 * UX-024 — the shared Modal is a real dialog: role, aria-modal, labelled title,
 * focus moves in and is trapped, Escape closes, focus returns to the opener.
 */
import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal from '../../components/Modal';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>New submission</button>
      <button type="button">Outside</button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Upload work">
        <label>Title<input /></label>
        <button type="button">Upload</button>
      </Modal>
    </>
  );
}

async function openIt() {
  render(<Harness />);
  await userEvent.click(screen.getByRole('button', { name: 'New submission' }));
  const dialog = screen.getByRole('dialog', { name: 'Upload work' });
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  return dialog;
}

describe('Modal a11y (UX-024)', () => {
  it('is a modal dialog named by its title, with a named close button', async () => {
    const dialog = await openIt();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('traps Tab inside the dialog in both directions', async () => {
    await openIt();
    const close = screen.getByRole('button', { name: 'Close' });
    const upload = screen.getByRole('button', { name: 'Upload' });
    upload.focus();
    await userEvent.tab();
    expect(close).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(upload).toHaveFocus();
  });

  it('closes on Escape and returns focus to the control that opened it', async () => {
    await openIt();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'New submission' })).toHaveFocus();
  });

  it('closes from the close button and returns focus', async () => {
    await openIt();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'New submission' })).toHaveFocus();
  });
});
