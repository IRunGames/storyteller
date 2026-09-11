import next from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// eslint-config-next is not used here: it bundles eslint-plugin-react, which is
// incompatible with ESLint 10 (it still calls the removed context.getFilename).
// The plugins that do work on 10 are wired up directly instead.
//
// Dropped with it: eslint-plugin-jsx-a11y, which runs on 10 but still declares a
// peer range capped at 9, so npm refuses to install it. Add it back here (and to
// devDependencies) once it publishes a release that allows ESLint 10.
const config = [
  { ignores: [".next/**", "next-env.d.ts"] },
  ...tseslint.configs.recommended,
  {
    plugins: {
      "@next/next": next,
      "react-hooks": reactHooks,
    },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs["core-web-vitals"].rules,
      ...reactHooks.configs.recommended.rules,
    },
  },
];

export default config;
