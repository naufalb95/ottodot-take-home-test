'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

interface BookingDetail {
  id: string;
  status: string;
  trialClass: { title: string; startsAt: string };
  student: { name: string };
}

function CheckoutResult() {
  const params = useSearchParams();
  const bookingId = params.get('booking_id');
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (bookingId) {
      api
        .get<BookingDetail>(`/api/bookings/${bookingId}`)
        .then(setBooking)
        .catch(() => setError('Could not load booking details.'));
    }
  }, [bookingId]);

  if (!bookingId) {
    return (
      <p>
        Missing booking reference.{' '}
        <Link href="/bookings" className="text-blue-600 underline">
          View bookings
        </Link>
      </p>
    );
  }

  if (error) return <p className="text-red-600">{error}</p>;
  if (!booking) return <p>Loading...</p>;

  return (
    <div className="mx-auto max-w-md text-center">
      {booking.status === 'CONFIRMED' ? (
        <>
          <h1 className="mb-2 text-2xl font-bold text-green-700">
            Booking confirmed
          </h1>
          <p className="text-gray-600">
            {booking.student.name} is booked into{' '}
            <strong>{booking.trialClass.title}</strong> on{' '}
            {new Date(booking.trialClass.startsAt).toLocaleDateString()}.
          </p>
        </>
      ) : booking.status === 'PENDING_PAYMENT' ? (
        <>
          <h1 className="mb-2 text-2xl font-bold text-yellow-600">
            Payment processing
          </h1>
          <p className="text-gray-600">
            We&apos;re waiting for payment confirmation. This usually takes a
            few seconds.
          </p>
        </>
      ) : (
        <>
          <h1 className="mb-2 text-2xl font-bold text-red-600">
            Booking not confirmed
          </h1>
          <p className="text-gray-600">
            Status: {booking.status.replace('_', ' ')}. The class may be full.
          </p>
        </>
      )}

      <Link
        href="/bookings"
        className="mt-6 inline-block text-sm text-blue-600 underline"
      >
        View all bookings
      </Link>
    </div>
  );
}

export default function CheckoutReturnPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <CheckoutResult />
    </Suspense>
  );
}
