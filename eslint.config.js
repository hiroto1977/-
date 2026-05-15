// Minimal flat ESLint config (v9+).
// Goal: catch obvious bugs without dictating style — Prettier-style
// formatting is intentionally NOT enforced. Strict TypeScript is the
// primary correctness gate (npm run typecheck).

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-electron/**',
      'node_modules/**',
      'reports/**',
      '.stryker-tmp/**',
      'coverage/**',
      'tmp-screenshots/**',
      'business-hub.html',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      // React hooks
      'react-hooks/rules-of-hooks': 'error',
      // 'react-hooks/exhaustive-deps' — too noisy for hand-written deps lists
      'react-hooks/exhaustive-deps': 'off',

      // Allow unused args prefixed with _ (our pattern for ignored params).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],

      // `any` is permitted at API boundaries; we prefer `unknown` but
      // legacy globals + test-seam casts (`as unknown as X`) need it.
      '@typescript-eslint/no-explicit-any': 'off',

      // Empty functions are allowed (e.g. no-op handlers in tests).
      '@typescript-eslint/no-empty-function': 'off',

      // False positives on try/catch/throw flow that has `let x; try {
      // x = ...; } catch { throw new Error(...); }` — the unused
      // assignment is the success path.
      'no-useless-assignment': 'off',

      // Defense-in-depth lazy `require()` in main.ts to break circular
      // imports is intentional.
      '@typescript-eslint/no-require-imports': 'off',

      // We rewrap caught errors with safe messages (no `cause`) to avoid
      // leaking implementation details. Disable in favor of explicit
      // err helpers.
      'preserve-caught-error': 'off',
    },
  },
  {
    // Scripts (CommonJS) — relax rules.
    files: ['scripts/**/*.cjs', '*.config.{js,cjs,mjs}'],
    languageOptions: {
      globals: {
        require: 'readonly',
        module: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      'no-undef': 'off',
    },
  },
  {
    // Tests can use looser typing.
    files: ['src/**/__tests__/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
);
