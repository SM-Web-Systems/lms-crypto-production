import { describe, it, expect } from 'vitest';
import { quizCorrectCount, quizScorePercent } from '../../utils/quizScore';

describe('quizScorePercent', () => {
  it('shows the API percentage as-is (one question, all correct is 100%, not 10000%)', () => {
    expect(quizScorePercent(100)).toBe(100);
  });
  it('keeps partial scores', () => {
    expect(quizScorePercent(67)).toBe(67);
    expect(quizScorePercent(0)).toBe(0);
  });
  it('clamps bad values', () => {
    expect(quizScorePercent(10000)).toBe(100);
    expect(quizScorePercent(-5)).toBe(0);
    expect(quizScorePercent(null)).toBe(0);
    expect(quizScorePercent(Number.NaN)).toBe(0);
  });
});

describe('quizCorrectCount', () => {
  it('recovers the correct count from the percentage', () => {
    expect(quizCorrectCount(100, 1)).toBe(1);
    expect(quizCorrectCount(67, 3)).toBe(2);
    expect(quizCorrectCount(33, 3)).toBe(1);
    expect(quizCorrectCount(0, 4)).toBe(0);
  });
  it('returns 0 when there are no questions', () => {
    expect(quizCorrectCount(100, 0)).toBe(0);
  });
});
