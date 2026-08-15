'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

interface ClassDetail {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
}

export default function EditClassPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [cls, setCls] = useState<ClassDetail | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<ClassDetail[]>('/api/classes')
      .then((classes) => {
        const found = classes.find(
          (c: { id: string }) => c.id === id,
        );
        if (found) setCls(found);
      });
  }, [id]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const form = new FormData(e.currentTarget);
    try {
      await api.patch(`/api/classes/${id}`, {
        title: form.get('title'),
        description: form.get('description') || null,
        location: form.get('location') || null,
      });
      router.push('/teacher/classes');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update');
      setSaving(false);
    }
  }

  async function handleCancel() {
    if (
      !confirm(
        'Cancel this class? All confirmed bookings will be refunded.',
      )
    )
      return;
    try {
      await api.delete(`/api/classes/${id}`);
      router.push('/teacher/classes');
    } catch (err) {
      alert(
        err instanceof ApiError ? err.message : 'Failed to cancel class',
      );
    }
  }

  if (!cls) return <p>Loading...</p>;

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold">Edit class</h1>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Title</label>
          <input
            name="title"
            defaultValue={cls.title}
            required
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Description</label>
          <textarea
            name="description"
            defaultValue={cls.description ?? ''}
            rows={3}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Location</label>
          <input
            name="location"
            defaultValue={cls.location ?? ''}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Cancel class
          </button>
        </div>
      </form>
    </div>
  );
}
