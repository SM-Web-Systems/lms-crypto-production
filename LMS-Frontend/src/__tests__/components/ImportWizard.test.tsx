import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ImportWizard from '../../components/ImportWizard';

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  courseId: 'course-123',
  courseTitle: 'Test Course',
  onImportComplete: vi.fn(),
};

describe('ImportWizard (Phase 26 C4)', () => {
  it('IW-FE-1: renders three source options (ZIP, CSV, Folder)', () => {
    render(<ImportWizard {...defaultProps} />);

    expect(screen.getByTestId('source-zip')).toBeDefined();
    expect(screen.getByTestId('source-csv')).toBeDefined();
    expect(screen.getByTestId('source-folder')).toBeDefined();
    expect(screen.getByText('Upload ZIP')).toBeDefined();
    expect(screen.getByText('Upload CSV')).toBeDefined();
    expect(screen.getByText('Select Folder')).toBeDefined();
  });

  it('IW-FE-2: does not render when open is false', () => {
    render(<ImportWizard {...defaultProps} open={false} />);
    expect(screen.queryByTestId('import-wizard')).toBeNull();
  });

  it('IW-FE-3: Escape key calls onClose', () => {
    const onClose = vi.fn();
    render(<ImportWizard {...defaultProps} onClose={onClose} />);
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
