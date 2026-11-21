/**
 * UX-001 AC8 — ConfirmDialog: alertdialog role, labelled and described,
 * focus trap, document-level Escape, focus return, loading label, error slot.
 */
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmDialog from '../../components/ConfirmDialog';

function Harness(props: { loading?: boolean; error?: string; onConfirm?: () => void; loadingLabel?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open it</button>
      <button type="button">Outside</button>
      <ConfirmDialog
        isOpen={open}
        title="Release 0.2 XLM?"
        description={<>Send <strong>0.2000000 XLM</strong> to Ada.</>}
        confirmLabel="Release 0.2000000 XLM"
        loading={props.loading}
        loadingLabel={props.loadingLabel}
        error={props.error}
        onConfirm={props.onConfirm ?? (() => {})}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

describe('ConfirmDialog a11y (UX-001 AC8)', () => {
  it('is an alertdialog labelled by its title and described by its description', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Release 0.2 XLM?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription(/Send 0.2000000 XLM to Ada/);
    expect(screen.getByText('0.2000000 XLM').tagName).toBe('STRONG');
  });

  it('traps Tab focus inside the dialog', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const confirm = screen.getByRole('button', { name: 'Release 0.2000000 XLM' });
    await waitFor(() => expect(screen.getByRole('alertdialog').contains(document.activeElement)).toBe(true));
    confirm.focus();
    await userEvent.tab();
    expect(cancel).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(confirm).toHaveFocus();
  });

  it('Shift+Tab straight after opening stays inside the dialog', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));
    await waitFor(() => expect(screen.getByRole('alertdialog').contains(document.activeElement)).toBe(true));
    await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Release 0.2000000 XLM' })).toHaveFocus();
  });

  it('closes on Escape pressed anywhere and returns focus to the opener', async () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open it' });
    await userEvent.click(opener);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    document.body.focus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('while loading: spinner label, both buttons disabled, Escape ignored', async () => {
    render(<Harness loading />);
    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));
    expect(screen.getByRole('button', { name: /Working…/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('uses a custom loading label', async () => {
    render(<Harness loading loadingLabel="Deleting…" />);
    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));
    expect(screen.getByRole('button', { name: /Deleting…/ })).toBeDisabled();
  });

  it('shows an error inside the dialog', async () => {
    const onConfirm = vi.fn();
    render(<Harness error="Server said no" onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));
    expect(screen.getByRole('alertdialog')).toContainElement(screen.getByRole('alert'));
    expect(screen.getByRole('alert')).toHaveTextContent('Server said no');
  });
});
