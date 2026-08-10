import type { Config } from "tailwindcss";

// Same Enzi dark palette as the storefront, tuned for data-dense admin UI.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0A0A0B",
          900: "#0A0A0B",
          800: "#0F0F12",
          card: "#121215",
          hover: "#17171B",
          line: "rgba(255,255,255,0.08)",
        },
        cloud: "#F4F4F5",
        muted: "#9BA0A6",
        faint: "#6B7076",
        gold: "#F5C518",
        whatsapp: "#25D366",
        indigo: "#5B6CF0",
        danger: "#EF4444",
      },
      fontFamily: {
        display: ["Archivo", "system-ui", "sans-serif"],
        sans: ["Manrope", "system-ui", "sans-serif"],
      },
      maxWidth: { shell: "1400px" },
    },
  },
  plugins: [],
} satisfies Config;
