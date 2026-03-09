import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [resolve(appRoot, "index.html"), resolve(appRoot, "src/**/*.{js,jsx,ts,tsx}")],
  theme: {
    extend: {
      colors: {
        brand: "#1F2837",
        "brand-soft": "#2C3B52",
      },
      boxShadow: {
        soft: "0 10px 24px rgba(15, 23, 42, 0.08)",
      },
    },
  },
  plugins: [],
};
