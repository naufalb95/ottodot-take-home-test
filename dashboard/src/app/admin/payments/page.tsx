'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';

interface PaymentAttempt {
  id: string;
  providerRef: string;
  amountCents: number;
  currency: string;
  status: string;
  refundReason: string | null;
  createdAt: string;
  booking: {
    id: string;
    status: string;
    student: { name: string; parent: { name: string; email: string } };
    trialClass: { title: string };
  };
}

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<PaymentAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<PaymentAttempt[]>('/api/admin/payments')
      .then(setPayments)
      .finally(() => setLoading(false));
  }, []);

  async function handleRetry(id: string) {
    try {
      const updated = await api.post<PaymentAttempt>(
        `/api/admin/payments/${id}/retry-refund`,
      );
      setPayments((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: updated.status } : p)),
      );
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Retry failed');
    }
  }

  if (loading) return <p>Loading...</p>;

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold">Payments</h1>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="pb-2 font-medium">Class</th>
              <th className="pb-2 font-medium">Student</th>
              <th className="pb-2 font-medium">Parent</th>
              <th className="pb-2 font-medium">Amount</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Date</th>
              <th className="pb-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-gray-100">
                <td className="py-2">{p.booking.trialClass.title}</td>
                <td className="py-2">{p.booking.student.name}</td>
                <td className="py-2">{p.booking.student.parent.name}</td>
                <td className="py-2 tabular-nums">
                  ${(p.amountCents / 100).toFixed(2)}
                </td>
                <td className="py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      p.status === 'SUCCEEDED'
                        ? 'bg-green-100 text-green-700'
                        : p.status === 'REFUNDED'
                          ? 'bg-blue-100 text-blue-700'
                          : p.status === 'REFUND_PENDING'
                            ? 'bg-yellow-100 text-yellow-700'
                            : p.status === 'REFUND_FAILED'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {p.status}
                  </span>
                  {p.refundReason && (
                    <span className="ml-1 text-xs text-gray-400">
                      {p.refundReason}
                    </span>
                  )}
                </td>
                <td className="py-2 text-gray-500">
                  {new Date(p.createdAt).toLocaleDateString()}
                </td>
                <td className="py-2">
                  {p.status === 'REFUND_FAILED' && (
                    <button
                      onClick={() => handleRetry(p.id)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Retry
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
