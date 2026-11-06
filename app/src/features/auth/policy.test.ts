import { canEdit, initialsOf, isAdmin, passwordProblem, toEmail } from './policy';

describe('passwordProblem', () => {
  it('requires matching passwords', () => expect(passwordProblem('Abcdefghij12', 'x')).toMatch(/do not match/));
  it.each(['short1A', 'alllowercase123', 'ALLUPPERCASE123', 'NoNumbersHereAtAll'])('rejects %s', (p) => {
    expect(passwordProblem(p, p)).toMatch(/at least 12/);
  });
  it('accepts a strong password', () => expect(passwordProblem('GoodPassw0rdOK', 'GoodPassw0rdOK')).toBeNull());
});

describe('roles', () => {
  it('viewer cannot edit or administer', () => {
    expect(canEdit('viewer')).toBe(false);
    expect(isAdmin('viewer')).toBe(false);
  });
  it('editor can edit but not administer', () => {
    expect(canEdit('editor')).toBe(true);
    expect(isAdmin('editor')).toBe(false);
  });
  it('admin can do both', () => {
    expect(canEdit('admin')).toBe(true);
    expect(isAdmin('admin')).toBe(true);
  });
  it('null role can do nothing', () => expect(canEdit(null) || isAdmin(null)).toBe(false));
});

describe('helpers', () => {
  it('builds the internal email', () => expect(toEmail(' Kasun.P ', 'users.x.app')).toBe('kasun.p@users.x.app'));
  it('builds initials', () => expect(initialsOf('Nimal Silva Perera')).toBe('NS'));
});
