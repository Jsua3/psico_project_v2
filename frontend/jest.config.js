/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  testMatch: ['**/*.spec.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(@angular|rxjs|tslib)/)',
  ],
  transform: {
    '^.+\\.(ts|mjs|js)$': ['ts-jest', {
      tsconfig: 'tsconfig.spec.json',
      diagnostics: false,
      useESM: false,
    }],
  },
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  moduleNameMapper: {
    '^phaser$': '<rootDir>/src/__mocks__/phaser.ts',
  },
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.spec.json',
      diagnostics: false,
    },
  },
};
