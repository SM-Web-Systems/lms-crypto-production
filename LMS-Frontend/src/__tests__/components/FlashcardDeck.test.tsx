import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

import { parseFlashcards, FlashcardDeck } from '../../components/FlashcardDeck';

// ── Parser tests ──────────────────────────────────────────────────────────────

const MODULE_1_SAMPLE = `# Module 1 — Introduction to Blockchain: Flashcards

## Card 1
**Q:** Which two researchers published a paper in 1991?
**A:** Stuart Haber and W. Scott Stornetta.

## Card 2
**Q:** Concept: Smart Contract
**A:** Definition: Self-executing digital agreements with terms written in code.

## Card 3
**Q:** What is the total supply of Bitcoin?
**A:** 21 million coins.
`;

const MODULE_2_SAMPLE = `# Module 2 — Technical Foundations: Flashcards

## Card 1
**Q:** What is a hash function?
**A:** A one-way mathematical function that maps input to a fixed-length output.

---

## Card 2
**Q:** Term: Equivocation.
**A:** Definition: The act of sending conflicting messages in a distributed system.

---

## Card 3
**Q:** The process of converting plaintext to ciphertext is known as _____.
**A:** Encryption.
`;

const INLINE_CODE_SAMPLE = `# Module 4 — Smart Contracts: Flashcards

## Card 1
**Q:** What does \`msg.sender\` refer to in Solidity?
**A:** The address of the account that called the current function.

---

## Card 2
**Q:** What is the purpose of the \`require\` keyword?
**A:** It validates conditions and reverts the transaction if the condition is false.
`;

const MALFORMED_SAMPLE = `# Flashcards

## Card 1
**Q:** Valid question?
**A:** Valid answer.

## Card 2
**Q:** Missing answer — no A line here.

## Card 3
Just some random text, no Q or A.

## Card 4
**Q:** Another valid question?
**A:** Another valid answer.
`;

describe('parseFlashcards — parser', () => {
  it('FC-PARSE-1: parses Module 1 format (no --- delimiters)', () => {
    const cards = parseFlashcards(MODULE_1_SAMPLE, 'bvc-1-flashcards');
    expect(cards.length).toBe(3);
    expect(cards[0].front).toBe('Which two researchers published a paper in 1991?');
    expect(cards[0].back).toBe('Stuart Haber and W. Scott Stornetta.');
  });

  it('FC-PARSE-2: parses Module 2+ format (with --- delimiters)', () => {
    const cards = parseFlashcards(MODULE_2_SAMPLE, 'bvc-2-flashcards');
    expect(cards.length).toBe(3);
    expect(cards[0].front).toBe('What is a hash function?');
    expect(cards[2].front).toContain('_____');
    expect(cards[2].back).toBe('Encryption.');
  });

  it('FC-PARSE-3: preserves card order', () => {
    const cards = parseFlashcards(MODULE_1_SAMPLE, 'test');
    expect(cards[0].front).toContain('two researchers');
    expect(cards[1].front).toContain('Smart Contract');
    expect(cards[2].front).toContain('total supply');
  });

  it('FC-PARSE-4: generates deterministic card IDs', () => {
    const cards = parseFlashcards(MODULE_1_SAMPLE, 'bvc-1-flashcards');
    expect(cards[0].id).toBe('bvc-1-flashcards-card-1');
    expect(cards[1].id).toBe('bvc-1-flashcards-card-2');
    expect(cards[2].id).toBe('bvc-1-flashcards-card-3');
  });

  it('FC-PARSE-5: preserves inline Markdown in card faces', () => {
    const cards = parseFlashcards(INLINE_CODE_SAMPLE, 'bvc-4-flashcards');
    expect(cards[0].front).toContain('`msg.sender`');
    expect(cards[1].front).toContain('`require`');
  });

  it('FC-PARSE-6: handles Concept/Definition and Term/Definition variants', () => {
    const cards = parseFlashcards(MODULE_1_SAMPLE, 'test');
    expect(cards[1].front).toBe('Concept: Smart Contract');
    expect(cards[1].back).toContain('Definition:');

    const cards2 = parseFlashcards(MODULE_2_SAMPLE, 'test');
    expect(cards2[1].front).toContain('Term: Equivocation');
    expect(cards2[1].back).toContain('Definition:');
  });

  it('FC-PARSE-7: handles fill-in-the-blank format', () => {
    const cards = parseFlashcards(MODULE_2_SAMPLE, 'test');
    expect(cards[2].front).toContain('_____');
    expect(cards[2].back).toBe('Encryption.');
  });

  it('FC-PARSE-8: skips malformed cards (missing Q or A)', () => {
    const cards = parseFlashcards(MALFORMED_SAMPLE, 'test');
    // Only cards 1 and 4 are valid
    expect(cards.length).toBe(2);
    expect(cards[0].front).toBe('Valid question?');
    expect(cards[1].front).toBe('Another valid question?');
  });

  it('FC-PARSE-9: does not silently drop valid content', () => {
    const cards = parseFlashcards(MODULE_1_SAMPLE, 'test');
    // All 3 valid cards are present
    expect(cards.length).toBe(3);
    expect(cards.every(c => c.front.length > 0 && c.back.length > 0)).toBe(true);
  });

  it('FC-PARSE-10: does not generate cards from arbitrary text', () => {
    const cards = parseFlashcards('Just some text without any card headers.', 'test');
    expect(cards.length).toBe(0);
  });

  it('FC-PARSE-11: returns empty array for empty input', () => {
    expect(parseFlashcards('', 'test').length).toBe(0);
  });
});

// ── Component tests ─────────────────────────────────────────────────────────

const APPROVED_URL = 'https://github.com/SM-Web-Systems/vibe-coding-blockchain/blob/main/module-1-intro/content/flashcards.md';

function mockFetchOk(body: string) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(body, { status: 200 }),
  );
}

function mockFetchFail(status = 404) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response('Not found', { status }),
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('FlashcardDeck — component', () => {
  it('FC-COMP-1: first card renders front/question state', async () => {
    mockFetchOk(MODULE_1_SAMPLE);
    const { container } = render(
      <FlashcardDeck url={APPROVED_URL} title="Flashcards" itemId="bvc-1-flashcards" />,
    );
    await waitFor(() => expect(screen.getByText(/Card 1 of 3/)).toBeInTheDocument());
    expect(container.querySelector('.lms-flashcard-front')).not.toBeNull();
    // Front side visible
    const front = container.querySelector('.lms-flashcard-front')!;
    expect(front.getAttribute('aria-hidden')).toBe('false');
    expect(front.textContent).toContain('two researchers');
  });

  it('FC-COMP-2: flip button reveals answer/back state', async () => {
    mockFetchOk(MODULE_1_SAMPLE);
    const { container } = render(
      <FlashcardDeck url={APPROVED_URL} title="Flashcards" itemId="bvc-1-flashcards" />,
    );
    await waitFor(() => expect(screen.getByText(/Card 1 of 3/)).toBeInTheDocument());

    const flipBtn = screen.getByRole('button', { name: /show answer/i });
    fireEvent.click(flipBtn);

    const card = container.querySelector('.lms-flashcard-card')!;
    expect(card.classList.contains('lms-flashcard-card--flipped')).toBe(true);
    const back = container.querySelector('.lms-flashcard-back')!;
    expect(back.getAttribute('aria-hidden')).toBe('false');
    expect(back.textContent).toContain('Haber');
  });

  it('FC-COMP-3: flip button is keyboard accessible', async () => {
    mockFetchOk(MODULE_1_SAMPLE);
    render(<FlashcardDeck url={APPROVED_URL} title="Flashcards" itemId="bvc-1-flashcards" />);
    await waitFor(() => expect(screen.getByText(/Card 1 of 3/)).toBeInTheDocument());

    const flipBtn = screen.getByRole('button', { name: /show answer/i });
    expect(flipBtn.tagName).toBe('BUTTON');
    expect(flipBtn.getAttribute('type')).toBe('button');
  });

  it('FC-COMP-4: Previous/Next navigation works', async () => {
    mockFetchOk(MODULE_1_SAMPLE);
    render(<FlashcardDeck url={APPROVED_URL} title="Flashcards" itemId="bvc-1-flashcards" />);
    await waitFor(() => expect(screen.getByText(/Card 1 of 3/)).toBeInTheDocument());

    const nextBtn = screen.getByRole('button', { name: /next card/i });
    fireEvent.click(nextBtn);
    expect(screen.getByText(/Card 2 of 3/)).toBeInTheDocument();

    fireEvent.click(nextBtn);
    expect(screen.getByText(/Card 3 of 3/)).toBeInTheDocument();

    const prevBtn = screen.getByRole('button', { name: /previous card/i });
    fireEvent.click(prevBtn);
    expect(screen.getByText(/Card 2 of 3/)).toBeInTheDocument();
  });

  it('FC-COMP-5: first/last navigation disabled states', async () => {
    mockFetchOk(MODULE_1_SAMPLE);
    render(<FlashcardDeck url={APPROVED_URL} title="Flashcards" itemId="bvc-1-flashcards" />);
    await waitFor(() => expect(screen.getByText(/Card 1 of 3/)).toBeInTheDocument());

    const prevBtn = screen.getByRole('button', { name: /previous card/i });
    expect(prevBtn).toBeDisabled();

    const nextBtn = screen.getByRole('button', { name: /next card/i });
    fireEvent.click(nextBtn);
    fireEvent.click(nextBtn);
    // Now at last card
    expect(screen.getByText(/Card 3 of 3/)).toBeInTheDocument();
    expect(nextBtn).toBeDisabled();
    expect(prevBtn).not.toBeDisabled();
  });

  it('FC-COMP-6: progress indicator updates correctly', async () => {
    mockFetchOk(MODULE_1_SAMPLE);
    render(<FlashcardDeck url={APPROVED_URL} title="Flashcards" itemId="bvc-1-flashcards" />);
    await waitFor(() => expect(screen.getByText(/Card 1 of 3/)).toBeInTheDocument());

    const nextBtn = screen.getByRole('button', { name: /next card/i });
    fireEvent.click(nextBtn);
    expect(screen.getByText(/Card 2 of 3/)).toBeInTheDocument();
  });

  it('FC-COMP-7: reset restores first card/front state', async () => {
    mockFetchOk(MODULE_1_SAMPLE);
    const { container } = render(
      <FlashcardDeck url={APPROVED_URL} title="Flashcards" itemId="bvc-1-flashcards" />,
    );
    await waitFor(() => expect(screen.getByText(/Card 1 of 3/)).toBeInTheDocument());

    // Navigate to card 2 and flip
    fireEvent.click(screen.getByRole('button', { name: /next card/i }));
    fireEvent.click(screen.getByRole('button', { name: /show answer/i }));
    expect(screen.getByText(/Card 2 of 3/)).toBeInTheDocument();

    // Reset
    fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    expect(screen.getByText(/Card 1 of 3/)).toBeInTheDocument();
    const card = container.querySelector('.lms-flashcard-card')!;
    expect(card.classList.contains('lms-flashcard-card--flipped')).toBe(false);
  });

  it('FC-COMP-8: shuffle reorders cards', async () => {
    mockFetchOk(MODULE_1_SAMPLE);
    render(<FlashcardDeck url={APPROVED_URL} title="Flashcards" itemId="bvc-1-flashcards" />);
    await waitFor(() => expect(screen.getByText(/Card 1 of 3/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /shuffle/i }));
    // Should show (shuffled) indicator
    expect(screen.getByText(/shuffled/)).toBeInTheDocument();
    expect(screen.getByText(/Card 1 of 3/)).toBeInTheDocument();
  });

  it('FC-COMP-9: navigation resets flip state', async () => {
    mockFetchOk(MODULE_1_SAMPLE);
    const { container } = render(
      <FlashcardDeck url={APPROVED_URL} title="Flashcards" itemId="bvc-1-flashcards" />,
    );
    await waitFor(() => expect(screen.getByText(/Card 1 of 3/)).toBeInTheDocument());

    // Flip, then navigate
    fireEvent.click(screen.getByRole('button', { name: /show answer/i }));
    const card = container.querySelector('.lms-flashcard-card')!;
    expect(card.classList.contains('lms-flashcard-card--flipped')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /next card/i }));
    expect(card.classList.contains('lms-flashcard-card--flipped')).toBe(false);
  });

  it('FC-COMP-10: inline code in card faces is sanitized', async () => {
    mockFetchOk(INLINE_CODE_SAMPLE);
    const { container } = render(
      <FlashcardDeck url={APPROVED_URL} title="Flashcards" itemId="bvc-4-flashcards" />,
    );
    await waitFor(() => expect(screen.getByText(/Card 1 of 2/)).toBeInTheDocument());
    const front = container.querySelector('.lms-flashcard-front .lms-flashcard-text')!;
    // Should contain <code> from inline rendering
    expect(front.querySelector('code')).not.toBeNull();
    // No script tags
    expect(front.querySelector('script')).toBeNull();
  });

  it('FC-COMP-11: long content renders safely', async () => {
    const longCard = `## Card 1\n**Q:** ${'Word '.repeat(100)}\n**A:** ${'Answer '.repeat(100)}`;
    mockFetchOk(longCard);
    const { container } = render(
      <FlashcardDeck url={APPROVED_URL} title="Flashcards" itemId="test" />,
    );
    await waitFor(() => expect(screen.getByText(/Card 1 of 1/)).toBeInTheDocument());
    expect(container.querySelector('.lms-flashcard-text')).not.toBeNull();
  });
});

// ── Integration and regression tests ────────────────────────────────────────

describe('FlashcardDeck — integration', () => {
  it('FC-INT-1: approved BVC flashcards URL renders deck', async () => {
    mockFetchOk(MODULE_1_SAMPLE);
    render(<FlashcardDeck url={APPROVED_URL} title="Flashcards" itemId="bvc-1-flashcards" />);
    await waitFor(() => expect(screen.getByText(/Card 1 of 3/)).toBeInTheDocument());
    // Has flip button
    expect(screen.getByRole('button', { name: /show answer/i })).toBeInTheDocument();
  });

  it('FC-INT-2: non-approved URL shows error', async () => {
    render(<FlashcardDeck url="https://evil.com/flashcards.md" title="Test" itemId="test" />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/not from an approved repository/)).toBeInTheDocument();
  });

  it('FC-INT-3: failed fetch shows safe error', async () => {
    mockFetchFail(500);
    render(<FlashcardDeck url={APPROVED_URL} title="Flashcards" itemId="test" />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    const alert = screen.getByRole('alert');
    expect(alert.textContent).not.toContain('raw.githubusercontent.com');
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('FC-INT-4: empty file shows error', async () => {
    mockFetchOk('# No cards here\nJust text.');
    render(<FlashcardDeck url={APPROVED_URL} title="Flashcards" itemId="test" />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/no flashcards found/i)).toBeInTheDocument();
  });

  it('FC-INT-5: loading state shows spinner', () => {
    mockFetchOk(MODULE_1_SAMPLE);
    render(<FlashcardDeck url={APPROVED_URL} title="Flashcards" itemId="test" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/loading flashcards/i)).toBeInTheDocument();
  });

  it('FC-INT-6: card face sanitizes dangerous content', async () => {
    const xss = `## Card 1\n**Q:** <script>alert("xss")</script>Safe text\n**A:** <img onerror="alert(1)" src="x">Clean answer`;
    mockFetchOk(xss);
    const { container } = render(
      <FlashcardDeck url={APPROVED_URL} title="Test" itemId="test" />,
    );
    await waitFor(() => expect(screen.getByText(/Card 1 of 1/)).toBeInTheDocument());
    expect(container.querySelector('script')).toBeNull();
    const texts = container.querySelectorAll('.lms-flashcard-text');
    texts.forEach(t => {
      expect(t.querySelector('[onerror]')).toBeNull();
    });
  });

  it('FC-INT-7: no completion triggered by viewing cards', async () => {
    mockFetchOk(MODULE_1_SAMPLE);
    render(<FlashcardDeck url={APPROVED_URL} title="Flashcards" itemId="bvc-1-flashcards" />);
    await waitFor(() => expect(screen.getByText(/Card 1 of 3/)).toBeInTheDocument());
    // Navigate through all cards
    fireEvent.click(screen.getByRole('button', { name: /next card/i }));
    fireEvent.click(screen.getByRole('button', { name: /next card/i }));
    // No fetch calls besides the initial content fetch
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('FC-INT-8: deck has accessible region label', async () => {
    mockFetchOk(MODULE_1_SAMPLE);
    const { container } = render(
      <FlashcardDeck url={APPROVED_URL} title="Module 1 Flashcards" itemId="test" />,
    );
    await waitFor(() => expect(screen.getByText(/Card 1 of 3/)).toBeInTheDocument());
    const deck = container.querySelector('.lms-flashcard-deck')!;
    expect(deck.getAttribute('aria-label')).toBe('Module 1 Flashcards');
  });

  it('FC-INT-9: card surface has aria-live for screen reader updates', async () => {
    mockFetchOk(MODULE_1_SAMPLE);
    const { container } = render(
      <FlashcardDeck url={APPROVED_URL} title="Flashcards" itemId="test" />,
    );
    await waitFor(() => expect(screen.getByText(/Card 1 of 3/)).toBeInTheDocument());
    const surface = container.querySelector('.lms-flashcard-surface')!;
    expect(surface.getAttribute('aria-live')).toBe('polite');
  });
});
