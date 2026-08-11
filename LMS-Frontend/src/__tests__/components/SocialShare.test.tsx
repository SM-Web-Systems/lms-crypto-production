/**
 * Phase 24 C2: SocialShare component tests.
 *
 * SHARE-FE-1: SocialShare renders LinkedIn, Twitter, and Copy Link buttons
 * SHARE-FE-2: LinkedIn button opens share URL in new window
 * SHARE-FE-3: Copy Link button copies URL to clipboard
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SocialShare from '../../components/SocialShare';

describe('SocialShare', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('SHARE-FE-1: renders LinkedIn, Twitter, and Copy Link buttons', () => {
    render(<SocialShare url="https://lms.smwebsystems.com/verify/abc123" title="Blockchain 101" />);
    expect(screen.getByLabelText('Share on LinkedIn')).toBeTruthy();
    expect(screen.getByLabelText('Share on Twitter')).toBeTruthy();
    expect(screen.getByLabelText('Copy link')).toBeTruthy();
  });

  it('SHARE-FE-2: LinkedIn button opens share URL in new window', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<SocialShare url="https://lms.smwebsystems.com/verify/abc123" title="Blockchain 101" />);

    fireEvent.click(screen.getByLabelText('Share on LinkedIn'));

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('linkedin.com/sharing/share-offsite'),
      '_blank',
      expect.any(String),
    );
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent('https://lms.smwebsystems.com/verify/abc123')),
      '_blank',
      expect.any(String),
    );
  });

  it('SHARE-FE-3: Copy Link button copies URL to clipboard', async () => {
    render(<SocialShare url="https://lms.smwebsystems.com/verify/abc123" title="Blockchain 101" />);

    fireEvent.click(screen.getByLabelText('Copy link'));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'https://lms.smwebsystems.com/verify/abc123',
    );
  });
});
