'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface Booking {
  id: string;
  status: string;
  createdAt: string;
  trialClass: { title: string; startsAt: string; location: string | null };
  student: { name: string };
  paymentAttempts: { status: string; refundReason: string | null }[];
}

export default function BookingsPage() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      api
        .get<Booking[]>('/api/bookings')
        .then(setBookings)
        .finally(() => setLoading(false));
    }
  }, [user]);

  async function handleCancel(id: string) {
    if (!confirm('Cancel this booking?')) return;
    try {
      await api.post(`/api/bookings/${id}/cancel`);
      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: 'CANCELLED' } : b)),
      );
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Failed to cancel');
    }
  }

  if (loading) return <p>Loading...</p>;

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold">My Bookings</h1>

      {bookings.length === 0 ? (
        <p className="text-gray-500">
          No bookings yet.{' '}
          <Link href="/classes" className="text-blue-600 underline">
            Browse classes
          </Link>
        </p>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4"
            >
              <div>
                <p className="font-medium">{b.trialClass.title}</p>
                <p className="text-sm text-gray-500">
                  {b.student.name} &middot;{' '}
                  {new Date(b.trialClass.startsAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    b.status === 'CONFIRMED'
                      ? 'bg-green-100 text-green-700'
                      : b.status === 'PENDING_PAYMENT'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {b.status.replace('_', ' ')}
                </span>
                {(b.status === 'PENDING_PAYMENT' ||
                  b.status === 'CONFIRMED') && (
                  <button
                    onClick={() => handleCancel(b.id)}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
