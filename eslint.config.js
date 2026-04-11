import js from "@eslint/js";
import { createRequire } from "node:module";
import globals from "globals";

const require = createRequire(import.meta.url);
const react = require("eslint-plugin-react");
const reactHooks = require("eslint-plugin-react-hooks");
const reactRefresh = require("eslint-plugin-react-refresh");

const lintTargets = [
  "apps/public-web/src/**/*.{js,jsx}",
  "packages/shared-domain/src/**/*.{js,jsx}",
  "packages/shared-supabase/src/**/*.{js,jsx}",
];

export default [
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.vite/**",
      "**/.vercel/**",
      "**/coverage/**",
    ],
  },
  js.configs.recommended,
  {
    files: lintTargets,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
];
