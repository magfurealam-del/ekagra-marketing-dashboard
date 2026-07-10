import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0F1923",
        card: "#1A2535",
        border: "#1E2D3D",
        border2: "#2A3A4A",
        text: "#E8EDF2",
        muted: "#6A8A9A",
        muted2: "#4A6A7A",
        accent: "#5ECBA1",
        accentDark: "#1D9E75",
        warn: "#EFB060",
        danger: "#E24B4A",
        danger2: "#F08080",
        info: "#78A8E0",
        info2: "#70D0F0",
        purple: "#C090F0",
      },
      borderRadius: {
        card: "10px",
      },
    },
  },
  plugins: [],
};
export default config;
