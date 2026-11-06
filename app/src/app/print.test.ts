import { fitZoom, pageSize } from './print';

describe('print fitting', () => {
  it('uses A4 landscape and portrait content areas', () => {
    expect(pageSize(false)).toEqual({ w: 1062, h: 733 });
    expect(pageSize(true)).toEqual({ w: 733, h: 1062 });
  });
  it('scales a wide diagram to the page width (with a 2% margin)', () => {
    expect(fitZoom(false, 1880, 1212, 0)).toBeCloseTo(Math.min(1062 / 1880, 733 / 1212) * 0.98, 5);
  });
  it('takes the header and footer out of the available height', () => {
    expect(fitZoom(false, 1000, 1000, 100)).toBeCloseTo((633 / 1000) * 0.98, 5);
  });
  it('never enlarges small content', () => {
    expect(fitZoom(false, 500, 300, 0)).toBeCloseTo(0.98, 5);
  });
  it('keeps long portrait tables readable', () => {
    expect(fitZoom(true, 1100, 9000, 100)).toBe(0.5);
  });
});
