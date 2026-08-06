/**
 * EB-001 — Error boundary catches render errors
 * EB-002 — Error boundary shows fallback UI
 * EB-003 — Error boundary shows error message
 * EB-004 — Error boundary retry button re-renders children
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../../components/ErrorBoundary';

function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test render error');
  }
  return <div>Content rendered</div>;
}

// Suppress console.error from React error boundary logging
const originalError = console.error;
beforeEach(() => { console.error = vi.fn(); });
afterEach(() => { console.error = originalError; });

describe('EB-001 — Error boundary catches render errors', () => {
  it('should catch errors and display default fallback', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText('Something went wrong')).toBeDefined();
  });
});

describe('EB-002 — Error boundary shows custom fallback', () => {
  it('should render custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom error page</div>}>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom error page')).toBeDefined();
  });
});

describe('EB-003 — Error boundary shows error message', () => {
  it('should display the error message in default fallback', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Test render error')).toBeDefined();
  });
});

describe('EB-004 — Error boundary retry re-renders children', () => {
  it('should re-render children when Try again is clicked', () => {
    let shouldThrow = true;
    function ConditionalThrow() {
      if (shouldThrow) throw new Error('Temporary error');
      return <div>Recovered content</div>;
    }

    render(
      <ErrorBoundary>
        <ConditionalThrow />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeDefined();

    // Fix the error condition before retrying
    shouldThrow = false;
    fireEvent.click(screen.getByText('Try again'));

    expect(screen.getByText('Recovered content')).toBeDefined();
  });
});
