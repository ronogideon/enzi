import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0A0A0B", // page background
          900: "#0A0A0B",
          800: "#0F0F12",
          card: "#121215", // card surface
          hover: "#17171B", // card hover / raised
          line: "rgba(255,255,255,0.08)",
        },
        cloud: "#F4F4F5", // primary text
        muted: "#9BA0A6", // body gray
        faint: "#6B7076", // captions / meta
        subhead: "#B9BEE6", // cool subhead tint
        gold: "#F5C518", // rating stars
        whatsapp: "#25D366",
        indigo: "#5B6CF0", // restrained interactive accent (matches chat)
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      maxWidth: { shell: "1280px" },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s ease-out both",
        "fade-in": "fade-in 0.5s ease-out both",
      },
    },
  },
  plugins: [],
};
export default config;
