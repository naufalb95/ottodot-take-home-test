'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface ClassDetail {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  priceCents: number;
  currency: string;
  location: string | null;
  ageMin: number | null;
  ageMax: number | null;
  teacher: string;
  seatsRemaining: number;
  bookedStudentIds: string[];
}

interface Student {
  id: string;
  name: string;
}

export default function ClassDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [cls, setCls] = useState<ClassDetail | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<ClassDetail>(`/api/classes/${slug}`).then(setCls);
  }, [slug]);

  useEffect(() => {
    if (user?.role === 'PARENT') {
      api.get<Student[]>('/api/students').then(setStudents);
    }
  }, [user]);

  async function handleBook() {
    if (!cls || !selectedStudent) return;
    setBooking(true);
    setError('');
    try {
      const result = await api.post<{ checkoutUrl: string }>('/api/bookings', {
        trialClassId: cls.id,
        studentId: selectedStudent,
        returnUrl: `${window.location.origin}/checkout/return`,
      });
      window.location.href = result.checkoutUrl;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Booking failed');
      setBooking(false);
    }
  }

  if (!cls) return <p>Loading...</p>;

  return (
    <>
      <h1 className="mb-2 text-2xl font-bold">{cls.title}</h1>
      <p className="text-gray-600">by {cls.teacher}</p>

      <div className="mt-6 space-y-2 text-sm">
        <p>
          <strong>Date:</strong> {new Date(cls.startsAt).toLocaleString()} –{' '}
          {new Date(cls.endsAt).toLocaleTimeString()}
        </p>
        {cls.location && (
          <p>
            <strong>Location:</strong> {cls.location}
          </p>
        )}
        {(cls.ageMin !== null || cls.ageMax !== null) && (
          <p>
            <strong>Age range:</strong> {cls.ageMin ?? '—'}–
            {cls.ageMax ?? '—'}
          </p>
        )}
        <p>
          <strong>Price:</strong> ${(cls.priceCents / 100).toFixed(2)}{' '}
          {cls.currency}
        </p>
        <p>
          <strong>Availability:</strong>{' '}
          <span
            className={
              cls.seatsRemaining === 0 ? 'text-red-600' : 'text-green-600'
            }
          >
            {cls.seatsRemaining === 0
              ? 'Full'
              : `${cls.seatsRemaining} seat${cls.seatsRemaining === 1 ? '' : 's'} left`}
          </span>
        </p>
        {cls.description && <p className="mt-4">{cls.description}</p>}
      </div>

      {user?.role === 'PARENT' && cls.seatsRemaining > 0 && (
        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold">Book this class</h2>

          {students.filter((s) => !cls.bookedStudentIds.includes(s.id)).length === 0 ? (
            <p className="text-sm text-gray-500">
              {students.length === 0 ? (
                <>
                  You need to{' '}
                  <a href="/students" className="text-blue-600 underline">
                    add a student
                  </a>{' '}
                  first.
                </>
              ) : (
                'All your childrens are already booked for this class.'
              )}
            </p>
          ) : (
            <>
              <label className="block text-sm font-medium">
                Select student
              </label>
              <select
                value={selectedStudent}
                onChange={(e) => setSelectedStudent(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Choose...</option>
                {students
                  .filter((s) => !cls.bookedStudentIds.includes(s.id))
                  .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

              <button
                onClick={handleBook}
                disabled={!selectedStudent || booking}
                className="mt-4 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {booking ? 'Redirecting to payment...' : 'Book & Pay'}
              </button>
            </>
          )}
        </div>
      )}

      {!user && cls.seatsRemaining > 0 && (
        <p className="mt-8 text-sm text-gray-500">
          <a href="/login" className="text-blue-600 underline">
            Sign in
          </a>{' '}
          to book this class.
        </p>
      )}
    </>
  );
}
