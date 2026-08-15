'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { api } from './api';

type Role = 'PARENT' | 'TEACHER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const AuthCtx = createContext<AuthContextValue>({
  user: null,
  loading: true,
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setUser(await api.get<User>('/api/auth/me'));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AuthCtx.Provider value={{ user, loading, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
