/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');
const base = require('../../jest.config');

/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  ...base,
  moduleNameMapper: {
    '^\\$$': path.join(__dirname, 'src'),
    '^\\$/(.*)$': path.join(__dirname, 'src/$1'),
    '^\\$test/(.*)$': path.join(__dirname, 'test/$1'),
  },
  collectCoverageFrom: ['**/src/**/*.ts'],
};
