/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0f",
        surface: "#1a1a2e",
        border: "#27272a",
        gold: "#c9a84c",
        muted: "#9ca3af",
        // Kept in sync with src/theme/colors.ts. These three were missing
        // entirely, so every className using text-danger/bg-success/
        // border-warning etc. silently dropped the class (not a registered
        // Tailwind token) -- error banners, the Log Out label, and several
        // status texts rendered with no color at all against the app's
        // near-black background, i.e. invisible.
        danger: "#ef4444",
        success: "#22c55e",
        warning: "#f59e0b",
      },
      fontFamily: {
        serif: ["PlayfairDisplay_700Bold"],
        sans: ["Inter_400Regular"],
        "sans-medium": ["Inter_600SemiBold"],
      },
    },
  },
  plugins: [],
};
