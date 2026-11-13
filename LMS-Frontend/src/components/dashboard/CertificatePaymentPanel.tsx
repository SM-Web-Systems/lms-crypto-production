import { useEffect, useState } from 'react';
import { PaymentCheckout } from '../PaymentCheckout';
import { courseCompletionService } from '../../services/courseCompletionService';
import type { CoursePricing } from '../../types/api';

/**
 * Shows how to pay for a pending paid certificate application. Hidden for free courses and once a
 * payment for the course is confirmed or waived. The server settles card payments from signed
 * Paystack webhooks, so this only starts checkout.
 */
export function CertificatePaymentPanel({ courseId, applicationId }: { courseId: string; applicationId: string }) {
  const [pricing, setPricing] = useState<CoursePricing | null>(null);
  const [settled, setSettled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([courseCompletionService.getPricing(courseId), courseCompletionService.getMyPayments()])
      .then(([price, payments]) => {
        if (cancelled) return;
        setPricing(price);
        setSettled(payments.some(p => p.courseId === courseId && (p.status === 'confirmed' || p.status === 'waived')));
      })
      .catch(() => { if (!cancelled) { setPricing(null); setSettled(null); } });
    return () => { cancelled = true; };
  }, [courseId]);

  if (!pricing || settled !== false || pricing.isFree || pricing.priceCents <= 0) return null;
  return (
    <div className="mt-3 w-full">
      <PaymentCheckout
        applicationId={applicationId}
        priceCents={pricing.priceCents}
        currency={pricing.currency}
        paymentMethods={pricing.paymentMethods ?? []}
        stellarPriceXlm={pricing.stellarPriceXlm}
        stellarPriceUsdc={pricing.stellarPriceUsdc}
      />
    </div>
  );
}
