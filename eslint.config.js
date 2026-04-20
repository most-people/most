import globals from 'globals'
import pluginJs from '@eslint/js'

export default [
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  pluginJs.configs.recommended,
  {
    ignores: [
      'out/**',
      '.next/**',
      'public/bundle.js',
      'public/bundle.js.map',
      'public/index.js',
      'public/chat-page.js',
      'node_modules/**'
    ]
  },
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
      'no-undef': 'warn'
    }
  }
]
