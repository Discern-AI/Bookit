import type { Config } from "tailwindcss";

// Design tokens per Folio Implementation Brief §1.
// Never use raw hex or arbitrary Tailwind values in component code —
// always reference a named token from this file.
const config: Config = {
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      aspectRatio: { book: "5 / 7" },

      gridTemplateColumns: { library: "240px minmax(0, 1fr)" },
      maxHeight: { dialog: "85dvh" },
      maxWidth: { drawer: "480px", message: "85%", 40: "10rem" },
      colors: {
        ink: {
          100: "#E4EAF0",
          950: "#0D1117",
          800: "#1E2A35",
          500: "#5A6A7A",
          200: "#C8D4DC",
          50: "#F0F4F7",
        },
        paper: {
          50: "#FAFAF8",
          100: "#F4F2ED",
          200: "#EAE6DE",
        },
        shelf: {
          700: "#2C4A6E",
          500: "#4A78A8",
          100: "#D6E6F5",
        },
        amber: {
          600: "#C4760A",
          100: "#FDF3DC",
        },
        sage: {
          600: "#3A7A5A",
          100: "#DFF0E8",
        },
        rose: {
          700: "#902640",
          600: "#B03050",
          100: "#F7E0E5",
        },
      },
      fontFamily: {
        display: ["var(--font-lora)", "Georgia", "serif"],
        body: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      fontSize: {
        xs: ["12px", "1.5"],
        sm: ["14px", "1.6"],
        base: ["16px", "1.7"],
        lg: ["18px", "1.6"],
        xl: ["20px", "1.5"],
        "2xl": ["24px", "1.4"],
        "3xl": ["30px", "1.3"],
        "4xl": ["38px", "1.2"],
        "5xl": ["48px", "1.1"],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "12px",
        full: "9999px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(13,17,23,0.08), 0 1px 2px rgba(13,17,23,0.04)",
        panel: "0 4px 12px rgba(13,17,23,0.10)",
        modal: "0 16px 48px rgba(13,17,23,0.16)",
      },
      transitionDuration: {
        fast: "150ms",
        base: "250ms",
      },
      transitionTimingFunction: {
        fast: "ease-out",
        base: "ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
