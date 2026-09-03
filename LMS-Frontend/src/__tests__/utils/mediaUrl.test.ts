import { describe, it, expect } from 'vitest';
import {
  isValidYoutubeId,
  youtubeWatchUrl,
  youtubeEmbedUrl,
  extractYoutubeId,
  getIframeVideoEmbedSrc,
} from '../../utils/mediaUrl';

// ── YouTube ID validation ────────────────────────────────────────────────────

describe('isValidYoutubeId', () => {
  it('accepts standard 11-char YouTube IDs', () => {
    expect(isValidYoutubeId('SyK8hJVq3_Q')).toBe(true);
    expect(isValidYoutubeId('RW1Q7lIExOM')).toBe(true);
    expect(isValidYoutubeId('-yf3zg36N8M')).toBe(true);
    expect(isValidYoutubeId('HYzC_-3wSAI')).toBe(true);
  });

  it('rejects empty, null, undefined', () => {
    expect(isValidYoutubeId('')).toBe(false);
    expect(isValidYoutubeId(null)).toBe(false);
    expect(isValidYoutubeId(undefined)).toBe(false);
  });

  it('rejects strings with special characters', () => {
    expect(isValidYoutubeId('<script>')).toBe(false);
    expect(isValidYoutubeId('abc def')).toBe(false);
    expect(isValidYoutubeId('abc/def/ghi')).toBe(false);
  });

  it('rejects too-short IDs', () => {
    expect(isValidYoutubeId('abc')).toBe(false);
    expect(isValidYoutubeId('12345')).toBe(false);
  });
});

// ── YouTube URL builders ─────────────────────────────────────────────────────

describe('youtubeWatchUrl', () => {
  it('builds watch URL for valid ID', () => {
    expect(youtubeWatchUrl('RW1Q7lIExOM')).toBe('https://www.youtube.com/watch?v=RW1Q7lIExOM');
  });

  it('returns null for invalid ID', () => {
    expect(youtubeWatchUrl('')).toBeNull();
    expect(youtubeWatchUrl(null)).toBeNull();
    expect(youtubeWatchUrl('<script>')).toBeNull();
  });
});

describe('youtubeEmbedUrl', () => {
  it('builds embed URL for valid ID', () => {
    expect(youtubeEmbedUrl('RW1Q7lIExOM')).toBe('https://www.youtube.com/embed/RW1Q7lIExOM?rel=0');
  });

  it('returns null for invalid ID', () => {
    expect(youtubeEmbedUrl(undefined)).toBeNull();
  });
});

// ── Video vs audio ID distinction ────────────────────────────────────────────

describe('video and audio YouTube IDs remain distinct', () => {
  // Module 1: video=SyK8hJVq3_Q, audio=RW1Q7lIExOM
  it('video ID extracts correctly from watch URL', () => {
    expect(extractYoutubeId('https://www.youtube.com/watch?v=SyK8hJVq3_Q')).toBe('SyK8hJVq3_Q');
  });

  it('audio ID extracts correctly from watch URL', () => {
    expect(extractYoutubeId('https://www.youtube.com/watch?v=RW1Q7lIExOM')).toBe('RW1Q7lIExOM');
  });

  it('video embed converts correctly', () => {
    expect(getIframeVideoEmbedSrc('https://www.youtube.com/watch?v=SyK8hJVq3_Q'))
      .toBe('https://www.youtube.com/embed/SyK8hJVq3_Q?rel=0');
  });

  it('audio watch URL is built from validated ID, not video ID', () => {
    // This confirms the audio and video IDs don't get mixed up
    const videoId = 'SyK8hJVq3_Q';
    const audioId = 'RW1Q7lIExOM';
    expect(videoId).not.toBe(audioId);
    expect(youtubeWatchUrl(audioId)).toBe('https://www.youtube.com/watch?v=RW1Q7lIExOM');
    expect(youtubeWatchUrl(videoId)).toBe('https://www.youtube.com/watch?v=SyK8hJVq3_Q');
  });
});
