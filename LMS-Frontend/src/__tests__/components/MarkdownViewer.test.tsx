import { describe, it, expect } from 'vitest';
import { toApprovedRawUrl } from '../../components/MarkdownViewer';

const PINNED = 'b9fad25e1e0ad1d6bd2c428778decfc1cd6cc472';
const RAW_BASE = `https://raw.githubusercontent.com/SM-Web-Systems/blockchain-foundations-for-vibe-coding/${PINNED}`;

describe('toApprovedRawUrl', () => {
  it('MV-1: converts GitHub blob URL to pinned raw URL', () => {
    const url = 'https://github.com/SM-Web-Systems/vibe-coding-blockchain/blob/main/module-1-intro/content/lesson.md';
    expect(toApprovedRawUrl(url)).toBe(`${RAW_BASE}/module-1-intro/content/lesson.md`);
  });

  it('MV-2: converts raw.githubusercontent.com URL to pinned raw URL', () => {
    const url = 'https://raw.githubusercontent.com/SM-Web-Systems/blockchain-foundations-for-vibe-coding/main/module-2-technical/content/study-guide.md';
    expect(toApprovedRawUrl(url)).toBe(`${RAW_BASE}/module-2-technical/content/study-guide.md`);
  });

  it('MV-3: returns null for non-approved org', () => {
    const url = 'https://github.com/evil-org/vibe-coding-blockchain/blob/main/module-1-intro/content/lesson.md';
    expect(toApprovedRawUrl(url)).toBeNull();
  });

  it('MV-4: returns null for non-approved repo', () => {
    const url = 'https://github.com/SM-Web-Systems/some-other-repo/blob/main/file.md';
    expect(toApprovedRawUrl(url)).toBeNull();
  });

  it('MV-5: returns null for non-GitHub URL', () => {
    expect(toApprovedRawUrl('https://example.com/file.md')).toBeNull();
  });

  it('MV-6: returns null for empty string', () => {
    expect(toApprovedRawUrl('')).toBeNull();
  });

  it('MV-7: returns null for invalid URL', () => {
    expect(toApprovedRawUrl('not-a-url')).toBeNull();
  });

  it('MV-8: handles www.github.com prefix', () => {
    const url = 'https://www.github.com/SM-Web-Systems/blockchain-foundations-for-vibe-coding/blob/main/module-5-defi-nfts/content/lesson.md';
    expect(toApprovedRawUrl(url)).toBe(`${RAW_BASE}/module-5-defi-nfts/content/lesson.md`);
  });

  it('MV-9: accepts both approved repo names', () => {
    const url1 = 'https://github.com/SM-Web-Systems/vibe-coding-blockchain/blob/main/file.md';
    const url2 = 'https://github.com/SM-Web-Systems/blockchain-foundations-for-vibe-coding/blob/main/file.md';
    expect(toApprovedRawUrl(url1)).toBe(`${RAW_BASE}/file.md`);
    expect(toApprovedRawUrl(url2)).toBe(`${RAW_BASE}/file.md`);
  });

  it('MV-10: pins raw URLs to approved commit (ignores original commit)', () => {
    const url = 'https://raw.githubusercontent.com/SM-Web-Systems/blockchain-foundations-for-vibe-coding/abc123/module-1-intro/content/lesson.md';
    const result = toApprovedRawUrl(url);
    expect(result).toContain(PINNED);
    expect(result).not.toContain('abc123');
  });
});
