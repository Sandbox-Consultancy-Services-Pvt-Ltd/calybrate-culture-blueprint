import { beforeEach, describe, expect, it } from 'vitest';
import { canExport, clearLocalData } from './policy';
import { esc as escMap } from '../map/render';
import { esc as escLife } from '../lifecycle/info';

describe('export is for editors and admins only', () => {
  it('viewers and signed-out people cannot export or print', () => {
    expect(canExport('viewer')).toBe(false);
    expect(canExport(null)).toBe(false);
    expect(canExport('editor')).toBe(true);
    expect(canExport('admin')).toBe(true);
  });
});

describe('clearLocalData', () => {
  beforeEach(() => localStorage.clear());
  it('removes cached app data but leaves unrelated keys', () => {
    localStorage.setItem('blueprint-cct-outcomes-v2', '{}');
    localStorage.setItem('blueprint-codex-rings-v1', '{}');
    localStorage.setItem('other-site', 'keep');
    clearLocalData();
    expect(localStorage.getItem('blueprint-cct-outcomes-v2')).toBeNull();
    expect(localStorage.getItem('blueprint-codex-rings-v1')).toBeNull();
    expect(localStorage.getItem('other-site')).toBe('keep');
  });
});

describe('esc escapes both quote kinds', () => {
  for (const [name, esc] of [['map', escMap], ['lifecycle', escLife]] as const) {
    it(name, () => {
      expect(esc(`<a href="x" onclick='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
    });
  }
});
