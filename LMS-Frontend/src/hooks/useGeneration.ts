import { useState } from 'react';

/**
 * A request generation counter for "only the latest load may commit" guards.
 * next() starts a new generation (making older ones stale) and returns it; isCurrent(n) checks one.
 * The object is stable across renders, so effect cleanups can call next() to invalidate in-flight work
 * (a plain ref read in a cleanup is what react-hooks/exhaustive-deps warns about).
 */
export function useGeneration() {
  const [generation] = useState(() => {
    let n = 0;
    return { next: () => ++n, isCurrent: (id: number) => id === n };
  });
  return generation;
}
