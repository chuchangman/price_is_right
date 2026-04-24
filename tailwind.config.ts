import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#FFF1F0",
          100: "#FFDDDB",
          500: "#FE4A51",
          600: "#E63A40",
          700: "#B82A30",
        },
      },
    },
  },
  plugins: [],
};

export default config;
