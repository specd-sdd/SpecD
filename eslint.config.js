// @ts-check
import tseslint from 'typescript-eslint'
import unicorn from 'eslint-plugin-unicorn'
import jsdoc from 'eslint-plugin-jsdoc'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/*.config.*', '**/*.mjs'] },

  // Base TypeScript rules (type-aware)
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Source files — full rule set
  {
    files: ['packages/*/src/**/*.ts'],
    plugins: { unicorn, jsdoc },
    settings: {
      jsdoc: { mode: 'typescript' },
    },
    rules: {
      // Enforce conventions/spec.md
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',

      // Named exports only + no public class fields (architecture/spec.md)
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Default exports are forbidden. Use named exports.',
        },
        {
          selector:
            'PropertyDefinition:not([accessibility="private"]):not([accessibility="protected"])',
          message: 'Classes must not expose public fields. Use methods or getters instead.',
        },
      ],
    },
  },

  // All source files — kebab-case filenames and JSDoc (eslint/spec.md, docs/spec.md)
  {
    files: ['packages/*/src/**/*.ts'],
    rules: {
      // Kebab-case filenames for source files
      'unicorn/filename-case': ['error', { case: 'kebabCase' }],

      // JSDoc on all functions, classes, methods, types (docs/spec.md)
      'jsdoc/require-jsdoc': [
        'error',
        {
          contexts: [
            'FunctionDeclaration',
            'ClassDeclaration',
            'MethodDefinition',
            'TSTypeAliasDeclaration',
            'TSInterfaceDeclaration',
          ],
        },
      ],
      'jsdoc/require-description': 'error',
      'jsdoc/require-param': ['error'],
      'jsdoc/require-returns': ['error', { checkGetters: false }],
      'jsdoc/require-param-description': 'error',
      'jsdoc/require-returns-description': 'error',
      'jsdoc/require-throws': 'error',
      'jsdoc/check-param-names': 'error',
      'jsdoc/check-tag-names': ['error', { definedTags: ['remarks', 'internal'] }],
    },
  },

  // Test files (specs and helpers) — relax all quality rules
  {
    files: ['packages/*/test/**/*.ts'],
    rules: {
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-description': 'off',
      'jsdoc/require-param': 'off',
      'jsdoc/require-returns': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
)
