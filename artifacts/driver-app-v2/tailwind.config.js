/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "#060d1b",
        surface: "#0d1829",
        border: "#263b57",
        gold: "#d4af52",
        muted: "#9caabe",
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
