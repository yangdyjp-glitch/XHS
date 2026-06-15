import { useState, useEffect, useCallback } from "react";
import { create } from "zustand";
import { trpc } from "../lib/trpc.js";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
  // 负责人代理登录时，此处为发起代理的原负责人；为空表示正常登录
  impersonator?: { id: number; name: string } | null;
}

interface AuthState {
  user: User | null;
  checked: boolean;
  selectedAccountId: number | null;
  setUser: (user: User | null) => void;
  setChecked: (checked: boolean) => void;
  setSelectedAccountId: (id: number | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  checked: false,
  selectedAccountId: null,
  setUser: (user) => set({ user, selectedAccountId: null }),
  setChecked: (checked) => set({ checked }),
  setSelectedAccountId: (selectedAccountId) => set({ selectedAccountId }),
}));

export function useAuth() {
  const { user, checked, setUser, setChecked, selectedAccountId, setSelectedAccountId } = useAuthStore();
  const loginMutation = trpc.auth.login.useMutation();
  const logoutMutation = trpc.auth.logout.useMutation();

  useEffect(() => {
    if (checked) return;
    let cancelled = false;
    fetch("/api/trpc/auth.me", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.result?.data) {
          setUser(data.result.data);
        }
        setChecked(true);
      })
      .catch(() => {
        if (!cancelled) setChecked(true);
      });
    return () => { cancelled = true; };
  }, [checked, setUser, setChecked]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginMutation.mutateAsync({ email, password });
    setUser(result);
    return result;
  }, [loginMutation, setUser]);

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
    setUser(null);
  }, [logoutMutation, setUser]);

  return {
    user,
    isLoading: !checked,
    login,
    logout,
    isLeader: user?.role === "leader",
    isTeacher: user?.role === "teacher" || user?.role === "editor",
    isEditor: user?.role === "editor",
    impersonator: user?.impersonator ?? null,
    selectedAccountId,
    setSelectedAccountId,
  };
}
