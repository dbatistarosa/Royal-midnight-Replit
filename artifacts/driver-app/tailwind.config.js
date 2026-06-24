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
