/**
 * Shim for @testing-library/react-hooks — React 19 + Zustand 5 compatible.
 *
 * Two problems:
 *  1. @testing-library/react-hooks v8 is incompatible with React 19 because
 *     React 19's act() is always async; state updates never flush synchronously
 *     when act() is not awaited.
 *  2. jest.resetModules() in beforeEach creates a fresh React instance for the
 *     re-required store, while the imported renderHook holds the old instance
 *     ("Invalid hook call").
 *
 * Solution: bypass React rendering entirely.
 *   - renderHook: temporarily monkey-patches React's hook functions so the
 *     hook callback can be called outside any component. Zustand's useStore
 *     uses React.useSyncExternalStore (which we redirect to getSnapshot()) and
 *     React.useCallback (which we make a no-op). The returned state object is
 *     identical to what the hook would return inside a component.
 *   - result.current: a getter that re-invokes the callback each time so it
 *     always reflects the store's latest state.
 *   - act: just runs the callback. Zustand's set() is synchronous, so the
 *     store state is updated immediately; the next access to result.current
 *     will see the new values.
 */

function withFakeReactHooks(React, fn) {
  const origUSES = React.useSyncExternalStore;
  const origUCB = React.useCallback;
  const origUDV = React.useDebugValue;

  // Redirect useSyncExternalStore to call getSnapshot() directly.
  React.useSyncExternalStore = function (_subscribe, getSnapshot) {
    return getSnapshot();
  };

  // useCallback with no memoization — just return the function.
  React.useCallback = function (f) {
    return f;
  };

  // useDebugValue is a no-op in tests.
  React.useDebugValue = function () {};

  try {
    return fn();
  } finally {
    React.useSyncExternalStore = origUSES;
    React.useCallback = origUCB;
    React.useDebugValue = origUDV;
  }
}

const renderHook = function (callback) {
  const React = require('react');

  const result = {
    get current() {
      // Re-invoke callback on every access so we always get fresh store state.
      return withFakeReactHooks(React, () => callback());
    },
  };

  return { result };
};

const act = function (callback) {
  // Zustand's set() is synchronous — state is updated before this returns.
  // result.current re-reads state lazily, so no flush/await needed.
  callback();
};

module.exports = { renderHook, act };
