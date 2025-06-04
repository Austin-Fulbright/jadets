/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest/presets/default-esm',  // ← use the ESM preset
  testEnvironment: 'node',

  extensionsToTreatAsEsm: ['.ts'],        // ← let .ts be loaded as ESM

  globals: {
    'ts-jest': {
      tsconfig: {
        module: 'ESNext',    // compile your TS into ES modules
        target: 'ES2020',
        allowJs: true,       // in case any .js needs compiling
        esModuleInterop: true
      },
    },
  },

  testMatch: ['<rootDir>/tests/**/*.spec.ts'],

  moduleFileExtensions: ['ts','js','json','node'],
};

