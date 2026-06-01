import globals from 'globals'
import pluginJs from '@eslint/js'
import tseslint from 'typescript-eslint'

export default [
  {
    ignores: [
      'dist/**',
      'out/**',
      '.next/**',
      'public/bundle.js',
      'public/bundle.js.map',
      'public/index.js',
      'public/chat-page.js',
      'node_modules/**',
    ],
  },
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-empty': 'off',
      'preserve-caught-error': 'off',
      'no-control-regex': 'off',
      'no-useless-escape': 'off',
      'no-cond-assign': 'off',
      'no-useless-assignment': 'off',
      'no-fallthrough': 'off',
      'no-constant-condition': 'off',
      'no-prototype-builtins': 'off',
      'valid-typeof': 'off',
      'no-redeclare': 'off',
      'no-func-assign': 'off',
      'getter-return': 'off',
      'no-unreachable': 'off',
      'prefer-const': 'off',
      'no-undef': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]
