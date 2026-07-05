import { act, renderHook } from '@testing-library/react-hooks';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

let usePremiumStore: typeof import('../src/store/usePremiumStore').usePremiumStore;

beforeEach(() => {
  jest.resetModules();
  usePremiumStore = require('../src/store/usePremiumStore').usePremiumStore;
});

test('démarre sans premium', () => {
  const { result } = renderHook(() => usePremiumStore());
  expect(result.current.isPremium).toBe(false);
  expect(result.current.source).toBeNull();
  expect(result.current.sepiaUnlocked).toBe(false);
});

test('setPremium active isPremium', () => {
  const { result } = renderHook(() => usePremiumStore());
  act(() => result.current.setPremium('iap'));
  expect(result.current.isPremium).toBe(true);
  expect(result.current.source).toBe('iap');
});

test('unlockSepia active sepiaUnlocked', () => {
  const { result } = renderHook(() => usePremiumStore());
  act(() => result.current.unlockSepia());
  expect(result.current.sepiaUnlocked).toBe(true);
});

test('clearPremium remet isPremium à false', () => {
  const { result } = renderHook(() => usePremiumStore());
  act(() => result.current.setPremium('gift'));
  act(() => result.current.clearPremium());
  expect(result.current.isPremium).toBe(false);
  expect(result.current.source).toBeNull();
});
