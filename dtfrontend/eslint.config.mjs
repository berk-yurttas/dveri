import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Suppress TypeScript warnings and errors
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "prefer-const": "off",
      
      // Suppress React warnings and errors
      "react/no-unescaped-entities": "off",
      "react-hooks/exhaustive-deps": "off",
      
      // Suppress Next.js warnings
      "@next/next/no-img-element": "off",
    },
  },
];

export default eslintConfig;
