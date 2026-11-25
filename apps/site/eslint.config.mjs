import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import globals from 'globals';

const nuxt = Object.fromEntries([
  'createError', 'defineEventHandler', 'defineNuxtConfig', 'definePageMeta', 'setHeader',
  'useHead', 'usePublicPage', 'useRoute', 'useRuntimeConfig', 'useSeoMeta',
].map((name) => [name, 'readonly']));

export default [
  { ignores: ['.nuxt/**', '.output/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
    rules: { 'vue/multi-word-component-names': 'off' },
  },
  { languageOptions: { globals: { ...globals.browser, ...globals.node, ...nuxt } } },
];
