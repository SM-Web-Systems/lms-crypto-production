/**
 * Tests for Phase 12 C1 — PaymentCheckout component.
 *
 * PAY-F10 — renders nothing for free courses (priceCents=0)
 * PAY-F11 — shows Paystack button when paystack method available
 * PAY-F12 — shows Stellar XLM button with price
 * PAY-F13 — shows Stellar USDC button with price
 * PAY-F14 — clicking Paystack triggers checkout and redirects
 * PAY-F15 — clicking Stellar shows payment instructions
 * PAY-F16 — shows error on checkout failure
 * PAY-F17 — manual-only shows contact admin message
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/courseCompletionService', () => ({
  courseCompletionService: {
    createPaystackCheckout: vi.fn(),
    createStellarCheckout: vi.fn(),
    getPaymentStatus: vi.fn(),
    getMyPayments: vi.fn(),
    getPricing: vi.fn(),
    getCourseProgress: vi.fn(),
    getStudentProgress: vi.fn(),
    getAllProgress: vi.fn(),
    getMyProgress: vi.fn(),
    getMyCredentials: vi.fn(),
    markLessonComplete: vi.fn(),
    getLessonCompletions: vi.fn(),
    updateProgress: vi.fn(),
    applyForCertificate: vi.fn(),
    getCourseApplications: vi.fn(),
    recommendApplication: vi.fn(),
    getRequirements: vi.fn(),
    saveRequirements: vi.fn(),
    getTiers: vi.fn(),
    getBadge: vi.fn(),
  },
}));

import { PaymentCheckout } from '../../components/PaymentCheckout';
import { courseCompletionService } from '../../services/courseCompletionService';

const mockPaystack = courseCompletionService.createPaystackCheckout as ReturnType<typeof vi.fn>;
const mockStellar = courseCompletionService.createStellarCheckout as ReturnType<typeof vi.fn>;

describe('PaymentCheckout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // PAY-F10: Free course renders nothing
  it('PAY-F10 — renders nothing for free courses', () => {
    const { container } = render(
      <PaymentCheckout
        applicationId="app1"
        priceCents={0}
        currency="USD"
        paymentMethods={['paystack']}
      />
    );
    expect(container.innerHTML).toBe('');
  });

  // PAY-F11: Paystack button
  it('PAY-F11 — shows Paystack button when paystack method available', () => {
    render(
      <PaymentCheckout
        applicationId="app1"
        priceCents={2500}
        currency="USD"
        paymentMethods={['paystack']}
      />
    );
    expect(screen.getByText('Pay with Card (Paystack)')).toBeInTheDocument();
  });

  // PAY-F12: Stellar XLM button with price
  it('PAY-F12 — shows Stellar XLM button with price', () => {
    render(
      <PaymentCheckout
        applicationId="app1"
        priceCents={2500}
        currency="USD"
        paymentMethods={['stellar_xlm']}
        stellarPriceXlm={100}
      />
    );
    expect(screen.getByText('Pay with XLM (100 XLM)')).toBeInTheDocument();
  });

  // PAY-F13: Stellar USDC button with price
  it('PAY-F13 — shows Stellar USDC button with price', () => {
    render(
      <PaymentCheckout
        applicationId="app1"
        priceCents={2500}
        currency="USD"
        paymentMethods={['stellar_usdc']}
        stellarPriceUsdc={25}
      />
    );
    expect(screen.getByText('Pay with USDC (25 USDC)')).toBeInTheDocument();
  });

  // PAY-F14: Paystack checkout redirect
  it('PAY-F14 — clicking Paystack triggers checkout and redirects', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    // Mock window.location.href
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...originalLocation, href: '' },
    });

    mockPaystack.mockResolvedValue({
      paymentId: 'pay1',
      checkoutUrl: 'https://checkout.paystack.com/abc',
      reference: 'ref1',
      accessCode: 'ac1',
    });

    render(
      <PaymentCheckout
        applicationId="app1"
        priceCents={2500}
        currency="USD"
        paymentMethods={['paystack']}
        onPaymentCreated={onCreated}
      />
    );

    await user.click(screen.getByText('Pay with Card (Paystack)'));

    await waitFor(() => {
      expect(mockPaystack).toHaveBeenCalledWith('app1');
      expect(onCreated).toHaveBeenCalledWith('pay1');
      expect(window.location.href).toBe('https://checkout.paystack.com/abc');
    });

    // Restore
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
  });

  // PAY-F15: Stellar shows payment instructions
  it('PAY-F15 — clicking Stellar shows payment instructions', async () => {
    const user = userEvent.setup();
    mockStellar.mockResolvedValue({
      paymentId: 'pay2',
      destinationAddress: 'GABCDEFGHIJK',
      memo: 'PAY-12345',
      amount: 100,
      currency: 'XLM',
    });

    render(
      <PaymentCheckout
        applicationId="app1"
        priceCents={2500}
        currency="USD"
        paymentMethods={['stellar_xlm']}
        stellarPriceXlm={100}
      />
    );

    await user.click(screen.getByText('Pay with XLM (100 XLM)'));

    await waitFor(() => {
      expect(screen.getByText('GABCDEFGHIJK')).toBeInTheDocument();
      expect(screen.getByText('PAY-12345')).toBeInTheDocument();
      expect(screen.getByText(/Send exactly 100 XLM/)).toBeInTheDocument();
    });
  });

  // PAY-F16: Shows error on checkout failure
  it('PAY-F16 — shows error on checkout failure', async () => {
    const user = userEvent.setup();
    mockPaystack.mockRejectedValue(new Error('Card declined'));

    render(
      <PaymentCheckout
        applicationId="app1"
        priceCents={2500}
        currency="USD"
        paymentMethods={['paystack']}
      />
    );

    await user.click(screen.getByText('Pay with Card (Paystack)'));

    await waitFor(() => {
      expect(screen.getByText('Card declined')).toBeInTheDocument();
    });
  });

  // PAY-F17: Manual-only shows contact message
  it('PAY-F17 — manual-only shows contact admin message', () => {
    render(
      <PaymentCheckout
        applicationId="app1"
        priceCents={2500}
        currency="USD"
        paymentMethods={['manual']}
      />
    );
    expect(screen.getByText(/Contact an administrator/)).toBeInTheDocument();
  });
});
