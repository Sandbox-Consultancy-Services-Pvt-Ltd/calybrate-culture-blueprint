import { resolveRoute } from './routes';

describe('resolveRoute', () => {
  it.each([
    ['', 'dash'],
    ['#', 'dash'],
    ['#lifecycle', 'dash'],
    ['#dash', 'dash'],
    ['#cct', 'cct'],
    ['#map', 'map'],
    ['#outcomes', 'outcomes'],
    ['#nonsense', 'dash'],
    ['#/cct', 'dash'],
  ])('%s -> %s', (hash, view) => {
    expect(resolveRoute(hash, true)).toBe(view);
  });

  it('only lets admins open #admin', () => {
    expect(resolveRoute('#admin', true)).toBe('admin');
    expect(resolveRoute('#admin', false)).toBe('dash');
  });
});
