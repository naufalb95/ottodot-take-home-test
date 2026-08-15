'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

export function Nav() {
  const { user, refresh } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await api.post('/api/auth/logout');
    await refresh();
    router.push('/classes');
  }

  return (
    <nav className="border-b border-gray-200 bg-white px-6 py-3">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <Link href="/classes" className="text-lg font-semibold">
          Trial Booking
        </Link>

        <div className="flex items-center gap-4 text-sm">
          <Link href="/classes">Classes</Link>

          {user?.role === 'PARENT' && (
            <>
              <Link href="/students">Students</Link>
              <Link href="/bookings">Bookings</Link>
            </>
          )}

          {(user?.role === 'TEACHER' || user?.role === 'ADMIN') && (
            <Link href="/teacher/classes">My Classes</Link>
          )}

          {user?.role === 'ADMIN' && (
            <Link href="/admin/payments">Payments</Link>
          )}

          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-gray-500">{user.name}</span>
              <button
                onClick={handleLogout}
                className="text-red-600 hover:underline"
              >
                Logout
              </button>
            </div>
          ) : (
            <Link href="/login" className="text-blue-600 hover:underline">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
