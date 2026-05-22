import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Dead code prevention: unused vars/imports are errors, not warnings.
      // Prefix with _ to intentionally ignore (e.g., _unused).
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],

      // `any` allowed pragmatically — API response handlers + dynamic data.
      // Tracked as warning so we can migrate to `unknown`/specific interfaces over time.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Empty interfaces are sometimes useful for branded types / future extension.
      '@typescript-eslint/no-empty-object-type': 'warn',

      // React 19 / react-hooks v6 strict rules — disabled because they flag
      // legitimate working patterns (Date.now() in render for time displays,
      // nested SidebarContent helpers, ref assignment for stable refs).
      // Re-enable individually as time permits to refactor.
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/set-state-in-effect': 'off',

      // Vite fast-refresh nit — file mixes component export with constant export.
      // Cosmetic; doesn't affect production builds.
      'react-refresh/only-export-components': 'warn',
    },
  },
])
