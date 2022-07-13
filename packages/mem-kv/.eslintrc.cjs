module.exports = {
  extends: '../../.eslintrc.cjs',
  parserOptions: {
    project: 'tsconfig.eslint.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
};
