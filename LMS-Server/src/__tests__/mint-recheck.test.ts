import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('LMS-MINT-J2-001 — re-check eligibility at mint time', () => {
  it('mint endpoint should call getCourseProgress before minting', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../routes/nftApplications.ts'), 'utf-8');
    // Find the mint endpoint (POST .../mint)
    const mintStart = src.indexOf("'/courses/:courseId/completions/applications/:appId/mint'");
    const mintBody = src.slice(mintStart);
    // getCourseProgress should appear AFTER the approved check but BEFORE mintCredential
    const progressIdx = mintBody.indexOf('getCourseProgress');
    const mintCallIdx = mintBody.indexOf('mintCredential(');
    expect(progressIdx).toBeGreaterThan(-1);
    expect(mintCallIdx).toBeGreaterThan(-1);
    expect(progressIdx).toBeLessThan(mintCallIdx);
  });
});
