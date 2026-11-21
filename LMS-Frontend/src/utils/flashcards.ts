// ── Flashcard parser ────────────────────────────────────────────────────────

export interface Flashcard {
  /** Deterministic ID: itemId-card-N (1-based) */
  id: string;
  /** Front text (question/term/concept) — may contain inline Markdown */
  front: string;
  /** Back text (answer/definition) — may contain inline Markdown */
  back: string;
}

/**
 * Parse a flashcards.md file into structured Flashcard[].
 *
 * Supported format:
 *   ## Card N
 *   **Q:** <question text>
 *   **A:** <answer text>
 *
 * Cards may be separated by `---` or just blank lines.
 * Module 1 omits `---` delimiters; modules 2-7 include them.
 */
export function parseFlashcards(markdown: string, itemId: string): Flashcard[] {
  const cards: Flashcard[] = [];
  // Split on ## Card headers — captures everything between headers
  const blocks = markdown.split(/^##\s+Card\s+\d+\s*$/im);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].trim();
    if (!block) continue;

    // Extract Q and A lines
    const qMatch = block.match(/\*\*Q:\*\*\s*(.*)/);
    const aMatch = block.match(/\*\*A:\*\*\s*(.*)/);

    if (qMatch && aMatch) {
      cards.push({
        id: `${itemId}-card-${cards.length + 1}`,
        front: qMatch[1].trim(),
        back: aMatch[1].trim(),
      });
    }
    // Malformed blocks (missing Q or A) are silently skipped —
    // the card count shown to the learner reflects only valid cards.
  }

  return cards;
}
