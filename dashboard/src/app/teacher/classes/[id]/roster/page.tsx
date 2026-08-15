'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';

interface RosterEntry {
  bookingId: string;
  studentName: string;
  parentName: string;
}

export default function RosterPage() {
  const { id } = useParams<{ id: string }>();
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<RosterEntry[]>(`/api/classes/${id}/roster`)
      .then(setRoster)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p>Loading...</p>;

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold">Class Roster</h1>

      {roster.length === 0 ? (
        <p className="text-gray-500">No confirmed students yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="pb-2 font-medium">Student</th>
                <th className="pb-2 font-medium">Parent</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((r) => (
                <tr key={r.bookingId} className="border-b border-gray-100">
                  <td className="py-2">{r.studentName}</td>
                  <td className="py-2">{r.parentName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
