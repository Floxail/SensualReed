module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@testing-library/react-hooks$':
      '<rootDir>/jest.testing-library-shim.js',
  },
};
