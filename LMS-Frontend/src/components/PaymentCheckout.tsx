/**
 * PaymentCheckout — Phase 12 C1: Payment method selection + checkout flow.
 *
 * Shows available payment methods for a course application and handles
 * Paystack redirect or Stellar payment instructions display.
 */

import { useState } from 'react';
import { Card, CardContent, CardTitle } from './Card';
import { Button } from './Button';
import { CreditCard, Wallet, AlertCircle, Copy, Check, Loader2 } from 'lucide-react';
import { courseCompletionService } from '../services/courseCompletionService';
import { getErrorMessage } from '../utils/apiError';

interface PaymentCheckoutProps {
  applicationId: string;
  priceCents: number;
  currency: string;
  paymentMethods: string[];
  stellarPriceXlm?: number | null;
  stellarPriceUsdc?: number | null;
  onPaymentCreated?: (paymentId: string) => void;
}

interface StellarInstructions {
  destinationAddress: string;
  memo: string;
  amount: number;
  currency: string;
  paymentId: string;
}

export function PaymentCheckout({
  applicationId,
  priceCents,
  currency,
  paymentMethods,
  stellarPriceXlm,
  stellarPriceUsdc,
  onPaymentCreated,
}: PaymentCheckoutProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stellarInstructions, setStellarInstructions] = useState<StellarInstructions | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (priceCents === 0 || paymentMethods.length === 0) {
    return null; // Free course — no payment needed
  }

  const handlePaystack = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await courseCompletionService.createPaystackCheckout(applicationId);
      onPaymentCreated?.(result.paymentId);
      // Redirect to Paystack checkout
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleStellar = async (stellarCurrency: 'xlm' | 'usdc') => {
    setLoading(true);
    setError(null);
    try {
      const result = await courseCompletionService.createStellarCheckout(applicationId, stellarCurrency);
      setStellarInstructions(result);
      onPaymentCreated?.(result.paymentId);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <Card>
      <CardContent>
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="h-5 w-5" />
          Payment — {formatPrice(priceCents)} {currency}
        </CardTitle>

        {error && (
          <div className="mt-3 flex items-center gap-2 text-red-600 text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {stellarInstructions ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm font-medium">
              Send exactly {stellarInstructions.amount} {stellarInstructions.currency} to:
            </p>

            <div className="bg-neutral-50 rounded p-3 space-y-2">
              <div>
                <label className="text-xs text-neutral-500">Destination Address</label>
                <div className="flex items-center gap-2">
                  <code className="text-xs break-all flex-1">{stellarInstructions.destinationAddress}</code>
                  <button
                    onClick={() => copyToClipboard(stellarInstructions.destinationAddress, 'address')}
                    className="text-neutral-400 hover:text-neutral-600"
                  >
                    {copiedField === 'address' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs text-neutral-500">Memo (required)</label>
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono font-bold">{stellarInstructions.memo}</code>
                  <button
                    onClick={() => copyToClipboard(stellarInstructions.memo, 'memo')}
                    className="text-neutral-400 hover:text-neutral-600"
                  >
                    {copiedField === 'memo' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <p className="text-xs text-neutral-500">
              Your payment will be confirmed automatically once the transaction is detected.
              Include the memo exactly as shown — payments without the correct memo cannot be matched.
            </p>

            <Button variant="outline" size="sm" onClick={() => setStellarInstructions(null)}>
              Back to payment methods
            </Button>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-neutral-600 mb-3">Choose a payment method:</p>

            {paymentMethods.includes('paystack') && (
              <Button
                className="w-full justify-start gap-2"
                onClick={handlePaystack}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                Pay with Card (Paystack)
              </Button>
            )}

            {paymentMethods.includes('stellar_xlm') && stellarPriceXlm && (
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => handleStellar('xlm')}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                Pay with XLM ({stellarPriceXlm} XLM)
              </Button>
            )}

            {paymentMethods.includes('stellar_usdc') && stellarPriceUsdc && (
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => handleStellar('usdc')}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                Pay with USDC ({stellarPriceUsdc} USDC)
              </Button>
            )}

            {paymentMethods.includes('manual') && !paymentMethods.includes('paystack') && (
              <p className="text-sm text-neutral-500 mt-2">
                Contact an administrator to arrange manual payment.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
