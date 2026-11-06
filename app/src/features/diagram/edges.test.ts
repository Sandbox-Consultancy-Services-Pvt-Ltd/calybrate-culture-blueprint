import { anchor, rounded, route, type Box } from './edges';

const box = (l: number, t: number, w: number, h: number): Box => ({ l, t, w, h, r: l + w, b: t + h, cx: l + w / 2, cy: t + h / 2 });

describe('anchor', () => {
  it('picks the middle of each side, with an optional offset', () => {
    const b = box(10, 20, 100, 40);
    expect(anchor(b, 'l')).toEqual([10, 40]);
    expect(anchor(b, 'r', 5)).toEqual([110, 45]);
    expect(anchor(b, 't')).toEqual([60, 20]);
    expect(anchor(b, 'b', -10)).toEqual([50, 60]);
  });
});

describe('route', () => {
  it('goes straight when the ends are level', () => {
    expect(route([0, 50], [100, 50], 'r', 'l')).toEqual([[0, 50], [100, 50]]);
  });
  it('uses a vertical mid-line between horizontal ends', () => {
    expect(route([0, 0], [100, 40], 'r', 'l')).toEqual([[0, 0], [50, 0], [50, 40], [100, 40]]);
    expect(route([0, 0], [100, 40], 'r', 'l', 70)).toEqual([[0, 0], [70, 0], [70, 40], [100, 40]]);
  });
  it('wraps around when both ends face the same way', () => {
    expect(route([100, 0], [100, 80], 'r', 'r', undefined, 10)).toEqual([[100, 0], [110, 0], [110, 80], [100, 80]]);
    expect(route([20, 0], [30, 80], 'l', 'l', undefined, 10)).toEqual([[20, 0], [10, 0], [10, 80], [30, 80]]);
  });
  it('uses one elbow between a horizontal and a vertical end', () => {
    expect(route([0, 0], [50, 50], 'r', 't')).toEqual([[0, 0], [50, 0], [50, 50]]);
    expect(route([0, 0], [50, 50], 'b', 'l')).toEqual([[0, 0], [0, 50], [50, 50]]);
  });
  it('uses a horizontal mid-line between vertical ends', () => {
    expect(route([0, 0], [40, 100], 'b', 't')).toEqual([[0, 0], [0, 50], [40, 50], [40, 100]]);
  });
});

describe('rounded', () => {
  it('draws a straight segment unchanged', () => {
    expect(rounded([[0, 0], [10, 0]])).toBe('M0 0 L10 0');
  });
  it('rounds corners with a quadratic curve, never longer than half a segment', () => {
    expect(rounded([[0, 0], [100, 0], [100, 100]], 9)).toBe('M0 0 L91 0 Q100 0 100 9 L100 100');
    expect(rounded([[0, 0], [10, 0], [10, 10]], 9)).toBe('M0 0 L5 0 Q10 0 10 5 L10 10');
  });
});
