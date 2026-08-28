import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#07080a",
        panel: "#101111",
        raise: "#16181d",
        line: "#23262d",
        "line-strong": "#31353d",
        accent: {
          DEFAULT: "#7C3AED",
          deep: "#5B21B6",
          soft: "#A78BFA",
        },
        severity: {
          critical: "#ff5c5c",
          high: "#ff9f43",
          medium: "#ffbc33",
          low: "#5ac8fa",
          info: "#8a8f98",
          pass: "#04B575",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 16px 40px -24px rgba(0,0,0,0.8)",
      },
      animation: {
        "pulse-slow": "pulse 3.5s cubic-bezier(0.4,0,0.6,1) infinite",
        scanline: "scanline 2.4s linear infinite",
      },
      keyframes: {
        scanline: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
