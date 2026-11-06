import { isValidUsername } from './username';

describe('isValidUsername', () => {
  it.each(['kasun', 'kasun.p', 'nimal_7', 'a-b', 'abc', 'abcdefghij123456'])('accepts %s', (v) => {
    expect(isValidUsername(v)).toBe(true);
  });
  it.each(['ab', 'a_b_c', '_kasun', 'kasun-', 'Kasun', 'abcdefghij1234567', 'a b', 'a..b', ''])(
    'rejects %s',
    (v) => {
      expect(isValidUsername(v)).toBe(false);
    },
  );
});
