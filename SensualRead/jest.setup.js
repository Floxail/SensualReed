/**
 * Jest setup: preserve React singleton across jest.resetModules() calls.
 *
 * Problem: @testing-library/react-hooks captures the React instance at import
 * time. When jest.resetModules() is called in beforeEach, fresh zustand/react
 * modules are loaded — a second React instance — causing "Invalid hook call."
 *
 * Fix: override jest.resetModules() to save and restore React-related module
 * cache entries so all code always shares the same React instance.
 */

const originalResetModules = jest.resetModules.bind(jest);

jest.resetModules = function () {
  // Collect React-related entries from the current module cache.
  const preserved = {};
  Object.keys(require.cache).forEach((key) => {
    const normalizedKey = key.replace(/\\/g, '/');
    if (
      normalizedKey.includes('/node_modules/react/') ||
      normalizedKey.includes('/node_modules/react-test-renderer/') ||
      normalizedKey.includes('/node_modules/scheduler/') ||
      normalizedKey.includes('/node_modules/react-is/')
    ) {
      preserved[key] = require.cache[key];
    }
  });

  // Clear all modules.
  originalResetModules();

  // Restore React-related modules so the next require() gets the same instance.
  Object.assign(require.cache, preserved);
};
