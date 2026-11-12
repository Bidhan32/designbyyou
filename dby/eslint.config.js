import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      'jsx/uses-vars': 'error',
    },
    plugins: {
      jsx: {
        rules: {
          'uses-vars': {
            meta: { schema: [] },
            create(context) {
              return {
                JSXOpeningElement(node) {
                  let name = node.name;
                  while (name.type === 'JSXMemberExpression') name = name.object;
                  if (name.type === 'JSXIdentifier' && /^[A-Z]/u.test(name.name)) {
                    context.sourceCode.markVariableAsUsed(name.name, node);
                  }
                },
              };
            },
          },
        },
      },
    },
  },
])
