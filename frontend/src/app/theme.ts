/** Light / dark theme. A display preference only (not a secret), so it may live in localStorage. */
import { useLayoutEffect } from "react";
import { create } from "zustand";

export type Theme = "dark" | "light";
const KEY = "dh.theme";

function apply(t: Theme) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#07111F" : "#F4F6F9");
}

export const useTheme = create<{ theme: Theme; set: (t: Theme) => void; toggle: () => void }>()((set, get) => ({
  theme: (localStorage.getItem(KEY) as Theme | null) ?? "dark",
  set: (theme) => {
    localStorage.setItem(KEY, theme);
    apply(theme);
    set({ theme });
  },
  toggle: () => get().set(get().theme === "dark" ? "light" : "dark"),
}));

/** Each experience has a default: Operations is dark, the portals are light. The Operations toggle overrides. */
export function useExperienceTheme(kind: "ops" | "portal") {
  const theme = useTheme((s) => s.theme);
  const effective: Theme = kind === "ops" ? theme : "light";
  useLayoutEffect(() => apply(effective), [effective]);
  return effective;
}
