import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getPricing = vi.fn();
const getMyPayments = vi.fn();
vi.mock('../../services/courseCompletionService', () => ({
  courseCompletionService: {
    getPricing: (...a: unknown[]) => getPricing(...a),
    getMyPayments: (...a: unknown[]) => getMyPayments(...a),
    createPaystackCheckout: vi.fn(),
    createStellarCheckout: vi.fn(),
  },
}));

import { CertificatePaymentPanel } from '../../components/dashboard/CertificatePaymentPanel';

const paid = { courseId: 'c1', priceCents: 1000, currency: 'ZAR', isFree: false, paymentMethods: ['manual', 'paystack'] };

beforeEach(() => { getPricing.mockReset(); getMyPayments.mockReset(); });

describe('CertificatePaymentPanel', () => {
  it('offers card payment for a pending paid certificate', async () => {
    getPricing.mockResolvedValue(paid);
    getMyPayments.mockResolvedValue([{ courseId: 'c1', status: 'pending', paymentMethod: 'manual' }]);
    render(<CertificatePaymentPanel courseId="c1" applicationId="a1" />);
    expect(await screen.findByText(/Pay with Card \(Paystack\)/)).toBeTruthy();
  });

  it('hides once the course payment is confirmed', async () => {
    getPricing.mockResolvedValue(paid);
    getMyPayments.mockResolvedValue([{ courseId: 'c1', status: 'confirmed', paymentMethod: 'paystack' }]);
    render(<CertificatePaymentPanel courseId="c1" applicationId="a1" />);
    await waitFor(() => expect(getMyPayments).toHaveBeenCalled());
    expect(screen.queryByText(/Pay with Card/)).toBeNull();
  });

  it('shows nothing for a free course', async () => {
    getPricing.mockResolvedValue({ ...paid, priceCents: 0, isFree: true, paymentMethods: [] });
    getMyPayments.mockResolvedValue([]);
    render(<CertificatePaymentPanel courseId="c1" applicationId="a1" />);
    await waitFor(() => expect(getPricing).toHaveBeenCalled());
    expect(screen.queryByText(/Pay with Card/)).toBeNull();
  });
});
