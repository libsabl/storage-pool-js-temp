module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  env: {
    es2021: true,
    node: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  plugins: ['@typescript-eslint', 'prettier'],
  rules: {
    '@typescript-eslint/no-non-null-assertion': 'off',
    'prettier/prettier': 'warn',
    semi: ['error', 'always'],
    quotes: ['error', 'single'],
  },
  ignorePatterns: ['**/dist/*'],
};
