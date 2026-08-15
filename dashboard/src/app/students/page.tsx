'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';

interface Student {
  id: string;
  name: string;
  dateOfBirth: string;
}

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<Student[]>('/api/students')
      .then(setStudents)
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const student = await api.post<Student>('/api/students', {
        name,
        dateOfBirth: dob,
      });
      setStudents((prev) => [...prev, student]);
      setName('');
      setDob('');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to add student',
      );
    }
  }

  if (loading) return <p>Loading...</p>;

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold">My Students</h1>

      <form
        onSubmit={handleAdd}
        className="mb-8 rounded-lg border border-gray-200 bg-white p-6"
      >
        <h2 className="mb-4 text-lg font-semibold">Add student</h2>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Child's name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            required
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </form>

      {students.length === 0 ? (
        <p className="text-gray-500">No students added yet.</p>
      ) : (
        <div className="space-y-2">
          {students.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3"
            >
              <span className="font-medium">{s.name}</span>
              <span className="text-sm text-gray-500">
                Born {new Date(s.dateOfBirth).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
