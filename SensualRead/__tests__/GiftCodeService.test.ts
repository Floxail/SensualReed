import SHA256 from 'crypto-js/sha256';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../src/store/usePremiumStore', () => ({
  usePremiumStore: {
    getState: () => ({ setPremium: jest.fn() }),
  },
}));

// Hash computed inside the factory to avoid jest.mock() hoisting / TDZ issues
jest.mock('../src/services/monetization/giftCodes', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mockSHA256 = require('crypto-js/sha256');
  return {
    GIFT_CODE_HASHES: [mockSHA256('TESTCODE2024').toString()],
  };
});

import { GiftCodeService } from '../src/services/monetization/GiftCodeService';

const TEST_CODE = 'TESTCODE2024';

test('validate retourne true pour code valide', () => {
  expect(GiftCodeService.validate(TEST_CODE)).toBe(true);
});

test('validate est insensible à la casse et aux espaces', () => {
  expect(GiftCodeService.validate('  testcode2024  ')).toBe(true);
});

test('validate retourne false pour code inconnu', () => {
  expect(GiftCodeService.validate('BADCODE')).toBe(false);
});

test('activate résout pour code valide', async () => {
  await expect(GiftCodeService.activate(TEST_CODE)).resolves.toBeUndefined();
});

test('activate rejette avec INVALID_CODE pour mauvais code', async () => {
  await expect(GiftCodeService.activate('BADCODE')).rejects.toThrow('INVALID_CODE');
});
