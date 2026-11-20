/**
 * Quiz scores from the API are already percentages (0–100):
 * the server computes Math.round((correct / total) * 100).
 * `total` is the number of questions. Never divide score by total again.
 */

/** Clamp and round an API score for display as a percentage. */
export function quizScorePercent(score: number | null | undefined): number {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, Math.round(score)));
}

/** Number of questions answered correctly, recovered from the percentage. */
export function quizCorrectCount(score: number | null | undefined, total: number | null | undefined): number {
  if (typeof total !== 'number' || !Number.isFinite(total) || total <= 0) return 0;
  return Math.round((quizScorePercent(score) / 100) * total);
}
