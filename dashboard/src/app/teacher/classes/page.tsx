'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface TeacherClass {
  id: string;
  title: string;
  slug: string;
  startsAt: string;
  seatsRemaining: number;
}

export default function TeacherClassesPage() {
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<TeacherClass[]>('/api/classes')
      .then(setClasses)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading...</p>;

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Classes</h1>
        <Link
          href="/teacher/classes/new"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Create class
        </Link>
      </div>

      {classes.length === 0 ? (
        <p className="text-gray-500">No classes yet.</p>
      ) : (
        <div className="space-y-3">
          {classes.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4"
            >
              <div>
                <Link
                  href={`/teacher/classes/${c.id}`}
                  className="font-medium hover:underline"
                >
                  {c.title}
                </Link>
                <p className="text-sm text-gray-500">
                  {new Date(c.startsAt).toLocaleDateString()} &middot;{' '}
                  {c.seatsRemaining} seats available
                </p>
              </div>
              <Link
                href={`/teacher/classes/${c.id}/roster`}
                className="text-sm text-blue-600 hover:underline"
              >
                Roster
              </Link>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
