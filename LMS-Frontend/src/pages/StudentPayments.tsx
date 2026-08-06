import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardContent, CardTitle } from '../components/Card';
import Button from '../components/Button';
import { courseCompletionService } from '../services/courseCompletionService';
import { getErrorMessage } from '../utils/apiError';
import { CreditCard, Loader2, ExternalLink } from 'lucide-react';

interface PaymentRecord {
  paymentId: string;
  courseId: string;
  courseName: string | null;
  amountCents: number;
  currency: string;
  paymentMethod: string;
  status: string;
  createdAt: string;
  confirmedAt: string | null;
}

function formatAmount(cents: number, currency: string): string {
  const dollars = (cents / 100).toFixed(2);
  return `$${dollars} ${currency}`;
}

function formatMethod(method: string): string {
  switch (method) {
    case 'paystack': return 'Paystack';
    case 'stellar_xlm': return 'Stellar XLM';
    case 'stellar_usdc': return 'Stellar USDC';
    case 'manual': return 'Manual';
    case 'waived': return 'Waived';
    default: return method.charAt(0).toUpperCase() + method.slice(1);
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'confirmed': return 'bg-green-100 text-green-800';
    case 'pending': return 'bg-yellow-100 text-yellow-800';
    case 'waived': return 'bg-blue-100 text-blue-800';
    case 'failed': return 'bg-red-100 text-red-800';
    case 'refunded': return 'bg-gray-100 text-gray-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

const StudentPayments: React.FC = () => {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await courseCompletionService.getMyPayments();
      setPayments(data);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load payment history.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        <span className="ml-2 text-gray-600">Loading payments...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Payment History</h1>
        <p className="text-gray-600 mt-1">View your certificate payment records</p>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
          <p className="text-red-600">{error}</p>
          <Button variant="secondary" size="sm" onClick={fetchPayments}>
            Retry
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Payments ({payments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 && !error ? (
            <div className="text-center py-12">
              <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" aria-hidden="true" />
              <p className="text-gray-600 mb-2">No payments yet</p>
              <p className="text-sm text-gray-500">Payments for certificate applications will appear here</p>
            </div>
          ) : payments.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Course</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Receipt</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {payments.map((p) => (
                    <tr key={p.paymentId} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {new Date(p.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {p.courseName ?? 'Unknown course'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {formatAmount(p.amountCents, p.currency)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {formatMethod(p.paymentMethod)}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(p.status)}`}>
                          {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {(p.status === 'confirmed' || p.status === 'waived') && (
                          <a
                            href={`${API_BASE}/payments/${p.paymentId}/receipt`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-primary-600 hover:text-primary-800"
                            aria-label={`Download receipt for ${p.courseName ?? 'payment'}`}
                          >
                            <ExternalLink className="h-4 w-4 mr-1" aria-hidden="true" />
                            Receipt
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentPayments;
