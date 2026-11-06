import { CCT_EDGES, CCT_ORG, CCT_UNITS, clampZoom, countLabel, fitZoomFor, visibleEdges } from './controller';
import html from './cct.html?raw';

describe('CCT edges', () => {
  it('drops the unit lines when the units are stacked under the hero box', () => {
    expect(visibleEdges(true, false)).toHaveLength(CCT_EDGES.length);
    expect(visibleEdges(false, false).some((e) => e.a.startsWith('u-'))).toBe(false);
  });
  it('drops the org -> CCT lines on phones', () => {
    const e = visibleEdges(true, true);
    expect(e.some((x) => x.a === 'o-org' || x.b === 'o-cct')).toBe(false);
    expect(e.some((x) => x.a === 'o-met')).toBe(true);
  });
  it('only joins ids that exist in the markup', () => {
    for (const e of CCT_EDGES) {
      expect(html, e.a).toContain(`id="${e.a}"`);
      expect(html, e.b).toContain(`id="${e.b}"`);
    }
    for (const id of [...Object.keys(CCT_UNITS), ...Object.keys(CCT_ORG)]) expect(html, id).toContain(`id="${id}"`);
  });
});

describe('zoom', () => {
  it('fits to the window height, between 50% and 100%', () => {
    expect(fitZoomFor(900, 200, 1000)).toBeCloseTo(0.688, 3);
    expect(fitZoomFor(900, 200, 300)).toBe(1);
    expect(fitZoomFor(600, 500, 1000)).toBe(0.5);
  });
  it('clamps manual zoom', () => {
    expect(clampZoom(0.1)).toBe(0.5);
    expect(clampZoom(5)).toBe(2.2);
    expect(clampZoom(1.3)).toBe(1.3);
  });
  it('labels counts', () => {
    expect(countLabel(1)).toBe('1 outcome');
    expect(countLabel(3)).toBe('3 outcomes');
  });
});
