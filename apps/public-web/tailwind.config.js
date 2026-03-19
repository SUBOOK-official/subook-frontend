import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [resolve(appRoot, "index.html"), resolve(appRoot, "src/**/*.{js,jsx,ts,tsx}")],
  theme: {
    extend: {
      colors: {
        "public-primary": "#080f47",
        "public-soft": "#f9f9f9",
      },
    },
  },
  plugins: [],
};
