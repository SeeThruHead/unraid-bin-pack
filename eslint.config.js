import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import functional from "eslint-plugin-functional";
import noComments from "eslint-plugin-no-comments";
import prettier from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";

export default [
  {
    ignores: ["node_modules/**", "dist/**", "*.js"]
  },
  // General rules for all TypeScript files
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
        ecmaVersion: "latest",
        sourceType: "module"
      }
    },
    plugins: {
      "@typescript-eslint": tseslint,
      functional: functional,
      "no-comments": noComments,
      prettier: prettier
    },
    rules: {
      ...prettierConfig.rules,

      // Prettier
      "prettier/prettier": "error",

      // Functional programming rules (testing one by one)
      "functional/no-let": "error",
      "functional/no-throw-statements": "error",

      // No comments rule
      "no-comments/disallowComments": "error",

      // Unused code detection
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_"
        }
      ],

      // Dead code detection
      "no-unreachable": "error",
      "no-constant-condition": "error",
      "no-empty": ["error", { allowEmptyCatch: true }],

      // Prefer const for immutability
      "prefer-const": "error",

      // No console.log (use Effect.Console)
      "no-console": ["error", { allow: ["warn", "error"] }],

      // TypeScript-specific rules
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/no-unnecessary-condition": "warn",

      // Effect-TS friendly rules
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/require-await": "off" // Effect doesn't use async/await
    }
  },
  // Allow console in TerminalUIService (it's for terminal output)
  {
    files: ["src/infra/TerminalUIService.ts"],
    rules: {
      "no-console": "off"
    }
  },
  // Relaxed rules for test files
  {
    files: ["src/**/*.test.ts", "src/test/**/*.ts"],
    rules: {
      // Allow any in tests for mocking and assertions
      "@typescript-eslint/no-explicit-any": "off",
      // Allow non-null assertions in tests
      "@typescript-eslint/no-non-null-assertion": "off"
    }
  }
];
