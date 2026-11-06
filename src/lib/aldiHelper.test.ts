import { describe, expect, it } from 'vitest';
import { helperBookmark } from './aldiHelper';

describe('helperBookmark', () => {
  const bookmark = helperBookmark('https://alex-jimz.github.io/sanso/');
  const code = decodeURIComponent(bookmark.slice('javascript:'.length));

  it('is a javascript: address on one line', () => {
    expect(bookmark.startsWith('javascript:')).toBe(true);
    expect(code).not.toContain('\n');
  });

  it('is valid JavaScript after joining its lines', () => {
    expect(() => new Function(code)).not.toThrow();
  });

  it('leaves out comments, which would hide code once joined onto one line', () => {
    expect(code).not.toMatch(/(^|[^:'])\/\/\s/);
  });

  it('sends the products to this app', () => {
    expect(code).toContain("const app = 'https://alex-jimz.github.io/sanso/';");
    expect(code).not.toContain('__SANSO_APP__');
  });
});
