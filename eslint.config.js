import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default [
  { ignores: ['**/dist/', '**/node_modules/', 'docs/prototip/', 'release/'] },
  js.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  {
    files: ['web/**/*.{js,svelte}'],
    languageOptions: { globals: { ...globals.browser } },
  },
];
