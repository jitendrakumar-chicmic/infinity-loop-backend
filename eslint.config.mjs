// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import unusedImports from 'eslint-plugin-unused-imports';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      import: importPlugin,
      'unused-imports': unusedImports,
    },
  },
  {
    rules: {
      // ---- Google-ish core rules ----
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-var': 'error',
      'prefer-const': 'error',
      'object-shorthand': 'error',

      // ---- Imports (Google enforces clean imports) ----
      'import/no-duplicates': 'error',
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],

      // ---- Naming conventions (Google style) ----
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'class',
          format: ['PascalCase'],
        },
      ],

      // ---- Unused cleanup (Google very strict) ----
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],

      // ---- TypeScript Google equivalents ----
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off',

      // ---- Safety (already partly enabled) ----
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',

      // ---- Prettier ----
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
);
