'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

export default function NewClassPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const form = new FormData(e.currentTarget);
    const data = {
      title: form.get('title') as string,
      description: (form.get('description') as string) || undefined,
      startsAt: new Date(form.get('startsAt') as string).toISOString(),
      endsAt: new Date(form.get('endsAt') as string).toISOString(),
      priceCents: Math.round(Number(form.get('price')) * 100),
      currency: 'SGD',
      location: (form.get('location') as string) || undefined,
      ageMin: form.get('ageMin') ? Number(form.get('ageMin')) : undefined,
      ageMax: form.get('ageMax') ? Number(form.get('ageMax')) : undefined,
    };

    try {
      await api.post('/api/classes', data);
      router.push('/teacher/classes');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to create class',
      );
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold">Create class</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Title</label>
          <input
            name="title"
            required
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Description</label>
          <textarea
            name="description"
            rows={3}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium">Start</label>
            <input
              name="startsAt"
              type="datetime-local"
              required
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">End</label>
            <input
              name="endsAt"
              type="datetime-local"
              required
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium">Price ($)</label>
            <input
              name="price"
              type="number"
              step="0.01"
              min="0"
              required
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Location</label>
            <input
              name="location"
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium">Min age</label>
            <input
              name="ageMin"
              type="number"
              min="0"
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Max age</label>
            <input
              name="ageMax"
              type="number"
              min="0"
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Create class'}
        </button>
      </form>
    </div>
  );
}
