'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface TrialClass {
  id: string;
  title: string;
  slug: string;
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
}

export default function ClassesPage() {
  const [classes, setClasses] = useState<TrialClass[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<TrialClass[]>('/api/classes')
      .then(setClasses)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading classes...</p>;

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold">Available Classes</h1>

      {classes.length === 0 ? (
        <p className="text-gray-500">No classes available right now.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {classes.map((c) => (
            <Link
              key={c.id}
              href={`/classes/${c.slug}`}
              className="block rounded-lg border border-gray-200 bg-white p-5 hover:border-blue-300"
            >
              <h2 className="text-lg font-semibold">{c.title}</h2>
              <p className="mt-1 text-sm text-gray-600">
                {new Date(c.startsAt).toLocaleDateString()} &middot;{' '}
                {c.teacher}
              </p>
              {c.location && (
                <p className="text-sm text-gray-500">{c.location}</p>
              )}
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="font-medium">
                  ${(c.priceCents / 100).toFixed(2)} {c.currency}
                </span>
                <span
                  className={
                    c.seatsRemaining === 0
                      ? 'text-red-600'
                      : 'text-green-600'
                  }
                >
                  {c.seatsRemaining === 0
                    ? 'Full'
                    : `${c.seatsRemaining} seat${c.seatsRemaining === 1 ? '' : 's'} left`}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
