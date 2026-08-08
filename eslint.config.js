import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '_site/**',
      'coverage/**',
      'dist/**',
      'node_modules/**',
      'AllForSUXINHAO/SUperDanmaku/**',
      'AllForSUXINHAO/SUperView/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['AllForSUXINHAO/TravellingBingo/src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['scripts/**/*.mjs', 'AllForSUXINHAO/TravellingBingo/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
)
