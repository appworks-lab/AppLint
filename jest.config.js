module.exports = {
  preset: 'ts-jest',
  resolver: '<rootDir>/jest-resolver.js',
  coverageDirectory: './coverage/',
  collectCoverage: true,
  collectCoverageFrom: ['packages/*/dist/*.js'],
  coveragePathIgnorePatterns: [
    '<rootDir>/node_modules/',
  ],
  testEnvironment: 'node',
  roots: [
    '<rootDir>/packages',
  ],
  testPathIgnorePatterns: [
    '/dist/',
    '/node_modules/',
    '/__testFixtures__/',
  ],
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.base.json',
    },
  },
};