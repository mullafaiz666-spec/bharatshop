import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextCoreWebVitals.map((config) => config.name === "next" ? {
    ...config,
    // Keep the override in the config object that declares the react-hooks
    // plugin; ESLint flat-config plugin declarations are object-scoped.
    rules: { ...config.rules, "react-hooks/set-state-in-effect": "warn" },
  } : config),
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
