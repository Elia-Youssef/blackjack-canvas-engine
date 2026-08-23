import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import coreBoundary from './tools/eslint-plugin-core-boundary/index.js';

/**
 * Lint configuration, and the home of the `core/` architecture gate.
 *
 * `npm run lint` runs this over the whole project with one exception: the
 * deliberately violating fixtures under `tests/lint/fixtures/` are excluded on
 * the command line, not here, so that the very same configuration can be
 * pointed at them by `tests/unit/core-boundary.test.ts`. If the exclusion lived
 * in this file the test would be proving a different configuration than the one
 * that gates the build, which is not proof of anything.
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'node_modules/**',
      '**/.determinism/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // BUILD-PLAN "Rules every part inherits", rule 5. An earlier build
      // swallowed an exception on every launch and shipped a visible defect
      // behind it for weeks.
      'no-empty': ['error', { allowEmptyCatch: false }],

      // tsc already resolves identifiers, and it does it with type information.
      'no-undef': 'off',
    },
  },

  // The shipped game. Browser globals are legitimate here, outside core/.
  {
    files: ['src/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },

  // Tooling, tests and configuration run under Node.
  {
    files: [
      'tests/**/*.ts',
      'tools/**/*.js',
      'scripts/**/*.mjs',
      '*.config.ts',
      '*.config.js',
    ],
    languageOptions: { globals: globals.node },
  },

  // ------------------------------------------------------------------
  // The core/ boundary. Item M3, severity Critical.
  // ------------------------------------------------------------------
  //
  // Applied to every source file rather than to a `**/core/**` glob on
  // purpose. Each rule works out for itself whether the file it is looking at
  // sits inside a `core` directory, so there is no glob here that a later edit
  // could narrow by accident. A gate that quietly stops applying looks exactly
  // like a gate that passes.
  //
  // `noInlineConfig` is the other half. Without it, the Critical architecture
  // rule of the project could be switched off for a line with a comment, by
  // anyone, with no review signal. Inside core/ it cannot.
  //
  // Every extension TypeScript and Node will load, not just the three in use
  // today. A `.mts` or `.tsx` file under core/ is still a core module, and a
  // file the gate does not match is a file the gate does not check.
  {
    files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
    plugins: { 'core-boundary': coreBoundary },
    rules: {
      'core-boundary/no-forbidden-imports': 'error',
      'core-boundary/no-dom': 'error',
      'core-boundary/no-math-random': 'error',
    },
  },
  {
    files: ['**/core/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
    linterOptions: { noInlineConfig: true },
  },

  // The violating fixtures. Everything unrelated to the boundary is switched
  // off so that every message the fixture produces comes from the gate under
  // test and the assertion can be exact.
  {
    files: ['tests/lint/fixtures/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'no-unused-vars': 'off',
      'no-console': 'off',
    },
  },
);
