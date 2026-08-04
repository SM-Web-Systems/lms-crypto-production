import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatusBadge, fmtSize } from '../../components/StatusBadge';

describe('StatusBadge', () => {
  it('renders Approved with green styling', () => {
    render(<StatusBadge status="approved" />);
    const badge = screen.getByText('Approved');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-green-100');
  });

  it('renders Rejected with red styling', () => {
    render(<StatusBadge status="rejected" />);
    const badge = screen.getByText('Rejected');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-red-100');
  });

  it('renders Pending for unknown status', () => {
    render(<StatusBadge status="pending" />);
    const badge = screen.getByText('Pending');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-yellow-100');
  });

  it('defaults to Pending for unrecognised status', () => {
    render(<StatusBadge status="whatever" />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });
});

describe('fmtSize', () => {
  it('formats bytes', () => {
    expect(fmtSize(500)).toBe('500 B');
  });

  it('formats kilobytes', () => {
    expect(fmtSize(2048)).toBe('2.0 KB');
  });

  it('formats megabytes', () => {
    expect(fmtSize(5242880)).toBe('5.0 MB');
  });
});
