/** Session: token in memory + sessionStorage (never localStorage). A 401 anywhere logs out. */
import { create } from "zustand";
import { auth } from "@/api/client";
import { authApi } from "@/api/adapters";
import type { User } from "@/api/types";

const read = (): User | null => {
  try {
    return JSON.parse(sessionStorage.getItem("dh.user") ?? "null") as User | null;
  } catch {
    return null;
  }
};

type AuthState = {
  user: User | null;
  login: (username: string, password: string) => Promise<User>;
  logout: () => void;
};

export const useAuth = create<AuthState>()((set) => ({
  user: auth.token ? read() : null,
  async login(username, password) {
    const r = await authApi.login(username, password);
    auth.set(r.token);
    sessionStorage.setItem("dh.user", JSON.stringify(r.user));
    set({ user: r.user });
    return r.user;
  },
  logout() {
    auth.set(null);
    sessionStorage.removeItem("dh.user");
    set({ user: null });
  },
}));

auth.onUnauthorized(() => useAuth.getState().logout());

/** One-click demo logins (config.USERS in the backend, password "demo") */
export const demoLogins = [
  { username: "admin", role: "admin", label: "Operations", hint: "DigitalHeat operator: fleet map, scheduler, economics" },
  { username: "acme", role: "customer", label: "Compute buyer", hint: "ACME AI: submits and follows AI jobs" },
  { username: "h1owner", role: "site_owner", label: "Host business", hint: "Hallenbad Gundeli: tank, heat and servers" },
] as const;
