import React, { useEffect, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Loader2, RefreshCw, ChevronLeft, ChevronRight, Shuffle, RotateCcw } from 'lucide-react';
import { toApprovedRawUrl } from './MarkdownViewer';

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

// ── Safe inline renderer ────────────────────────────────────────────────────

/**
 * Render inline Markdown (bold, code, links) to sanitized HTML.
 * Uses the same DOMPurify pipeline as MarkdownViewer.
 */
function renderInline(text: string): string {
  // marked.parseInline handles bold, italic, code, links without block elements
  const raw = marked.parseInline(text, { gfm: true }) as string;
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ['strong', 'em', 'b', 'i', 'code', 'a', 'span', 'sub', 'sup', 'del', 's'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
}

// ── Shuffle utility ─────────────────────────────────────────────────────────

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ── Component ───────────────────────────────────────────────────────────────

interface FlashcardDeckProps {
  /** GitHub blob or raw URL to the flashcards.md file */
  url: string;
  /** Course item title for display context */
  title: string;
  /** Course item ID for deterministic card IDs */
  itemId: string;
}

export const FlashcardDeck: React.FC<FlashcardDeckProps> = ({
  url,
  title,
  itemId,
}) => {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [shuffled, setShuffled] = useState(false);
  const [displayOrder, setDisplayOrder] = useState<Flashcard[]>([]);

  const loadContent = () => {
    setLoading(true);
    setError(null);
    setCards([]);
    setCurrentIndex(0);
    setFlipped(false);
    setShuffled(false);

    const rawUrl = toApprovedRawUrl(url);
    if (!rawUrl) {
      setError('Content source is not from an approved repository.');
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(rawUrl);
        if (!res.ok) throw new Error(`Failed to load flashcards (${res.status})`);
        const md = await res.text();
        if (cancelled) return;
        const parsed = parseFlashcards(md, itemId);
        if (parsed.length === 0) {
          setError('No flashcards found in this file.');
          return;
        }
        setCards(parsed);
        setDisplayOrder(parsed);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load flashcards');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadContent, [url, itemId]);

  const currentCard = displayOrder[currentIndex];

  const goTo = (index: number) => {
    setCurrentIndex(index);
    setFlipped(false);
  };

  const handleShuffle = () => {
    setDisplayOrder(shuffleArray(cards));
    setCurrentIndex(0);
    setFlipped(false);
    setShuffled(true);
  };

  const handleReset = () => {
    setDisplayOrder([...cards]);
    setCurrentIndex(0);
    setFlipped(false);
    setShuffled(false);
  };

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        goTo(currentIndex - 1);
      } else if (e.key === 'ArrowRight' && currentIndex < displayOrder.length - 1) {
        goTo(currentIndex + 1);
      } else if (e.key === ' ' || e.key === 'Enter') {
        // Only flip if the focused element is the card itself
        const target = e.target as HTMLElement;
        if (target.closest('.lms-flashcard-surface')) {
          e.preventDefault();
          setFlipped(f => !f);
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [currentIndex, displayOrder.length]);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 px-4" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-accent-teal" aria-hidden />
        <p className="text-sm text-neutral-500">Loading flashcards&hellip;</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 px-4" role="alert">
        <p className="text-sm text-red-600 font-medium">{error}</p>
        <button
          type="button"
          onClick={loadContent}
          className="inline-flex items-center gap-2 text-sm text-accent-teal font-medium hover:underline"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Retry
        </button>
      </div>
    );
  }

  if (!currentCard) return null;

  const frontHtml = renderInline(currentCard.front);
  const backHtml = renderInline(currentCard.back);

  return (
    <div className="lms-flashcard-deck px-4 py-6 sm:px-8 sm:py-8" aria-label={title}>
      {/* Progress */}
      <div className="text-center mb-6">
        <span className="text-sm font-medium text-neutral-500">
          Card {currentIndex + 1} of {displayOrder.length}
          {shuffled && <span className="ml-2 text-xs text-accent-teal">(shuffled)</span>}
        </span>
        {/* Progress bar */}
        <div className="mt-2 mx-auto max-w-xs h-1 rounded-full bg-neutral-200 overflow-hidden">
          <div
            className="h-full rounded-full bg-accent-teal transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / displayOrder.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Card */}
      <div
        className="lms-flashcard-surface"
        role="region"
        aria-label={flipped ? 'Answer side' : 'Question side'}
        aria-live="polite"
        tabIndex={0}
      >
        <div className={`lms-flashcard-card ${flipped ? 'lms-flashcard-card--flipped' : ''}`}>
          {/* Front face */}
          <div className="lms-flashcard-face lms-flashcard-front" aria-hidden={flipped}>
            <span className="lms-flashcard-label">Question</span>
            <div
              className="lms-flashcard-text"
              dangerouslySetInnerHTML={{ __html: frontHtml }}
            />
          </div>
          {/* Back face */}
          <div className="lms-flashcard-face lms-flashcard-back" aria-hidden={!flipped}>
            <span className="lms-flashcard-label lms-flashcard-label--answer">Answer</span>
            <div
              className="lms-flashcard-text"
              dangerouslySetInnerHTML={{ __html: backHtml }}
            />
          </div>
        </div>
      </div>

      {/* Flip button */}
      <div className="flex justify-center mt-5">
        <button
          type="button"
          onClick={() => setFlipped(f => !f)}
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-200/90 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50 transition-colors"
          aria-label={flipped ? 'Show question' : 'Show answer'}
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          {flipped ? 'Show question' : 'Flip card'}
        </button>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-center gap-3 mt-4">
        <button
          type="button"
          onClick={() => goTo(currentIndex - 1)}
          disabled={currentIndex === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200/90 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Previous card"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Previous
        </button>
        <button
          type="button"
          onClick={() => goTo(currentIndex + 1)}
          disabled={currentIndex === displayOrder.length - 1}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200/90 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Next card"
        >
          Next
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* Shuffle / Reset */}
      <div className="flex items-center justify-center gap-3 mt-3">
        <button
          type="button"
          onClick={handleShuffle}
          className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-accent-teal transition-colors"
          aria-label="Shuffle cards"
        >
          <Shuffle className="h-3.5 w-3.5" aria-hidden />
          Shuffle
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-accent-teal transition-colors"
          aria-label="Reset to original order"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Reset
        </button>
      </div>
    </div>
  );
};
