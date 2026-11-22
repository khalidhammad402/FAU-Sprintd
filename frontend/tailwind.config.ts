import type { Config } from "tailwindcss";

// Colours are CSS variables (src/index.css) so the same classes work in the dark and light theme.
// Semantic data colours have exactly one meaning each: see design/design-tokens.json.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        heat: { DEFAULT: v("heat"), ink: v("heat-ink") },
        tank: { DEFAULT: v("tank"), ink: v("tank-ink") },
        ok: { DEFAULT: v("ok"), ink: v("ok-ink") },
        idle: { DEFAULT: v("idle"), ink: v("idle-ink") },
        dump: { DEFAULT: v("dump"), ink: v("dump-ink") },
        critical: { DEFAULT: v("critical"), ink: v("critical-ink") },
        bg: v("bg"),
        surface: { DEFAULT: v("surface"), 2: v("surface-2"), 3: v("surface-3") },
        line: { DEFAULT: v("line"), strong: v("line-strong") },
        ink: { DEFAULT: v("ink"), 2: v("ink-2"), 3: v("ink-3") },
        accent: { DEFAULT: v("accent"), fg: v("accent-fg") },
        rail: v("rail"),
      },
      fontFamily: {
        sans: ['"Inter Variable"', "Inter", "system-ui", '"Segoe UI"', "sans-serif"],
        mono: ['"JetBrains Mono Variable"', "ui-monospace", "Consolas", "monospace"],
      },
      fontSize: {
        "2xs": ["11px", "14px"],
        xs: ["12px", "16px"],
        sm: ["13px", "18px"],
        base: ["14px", "20px"],
        md: ["16px", "22px"],
        lg: ["20px", "26px"],
        xl: ["28px", "32px"],
        "2xl": ["40px", "44px"],
      },
      borderRadius: { ctl: "8px", card: "12px", drawer: "16px" },
      boxShadow: {
        card: "0 1px 2px rgb(var(--shadow) / 0.06), 0 8px 24px -16px rgb(var(--shadow) / 0.35)",
        pop: "0 2px 6px rgb(var(--shadow) / 0.12), 0 24px 48px -20px rgb(var(--shadow) / 0.5)",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.23, 1, 0.32, 1)",
        "in-out": "cubic-bezier(0.77, 0, 0.175, 1)",
        drawer: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
      keyframes: {
        shimmer: { from: { backgroundPosition: "100% 0" }, to: { backgroundPosition: "-50% 0" } },
        ping1: { "0%": { opacity: "0.7", transform: "scale(1)" }, "100%": { opacity: "0", transform: "scale(1.8)" } },
        breathe: { "0%,100%": { boxShadow: "0 0 0 0 rgb(var(--critical) / 0)" }, "50%": { boxShadow: "0 0 0 4px rgb(var(--critical) / 0.28)" } },
        wave: { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
        rise: { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        travel: { from: { left: "0%" }, to: { left: "100%" } },
      },
      animation: {
        shimmer: "shimmer 1.5s linear infinite",
        ping1: "ping1 900ms cubic-bezier(0.23,1,0.32,1) 1",
        breathe: "breathe 2.4s cubic-bezier(0.77,0,0.175,1) infinite",
        rise: "rise 240ms cubic-bezier(0.23,1,0.32,1) both",
      },
    },
  },
  plugins: [],
} satisfies Config;
