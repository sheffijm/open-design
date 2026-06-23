import { describe, expect, it } from 'vitest';

import { replaceDesignMdColorAtIndex } from '../../src/runtime/kit-edit';

describe('replaceDesignMdColorAtIndex', () => {
  it('replaces the selected unique DESIGN.md color token', () => {
    const body = [
      '# Acme',
      '',
      '## Color Palette',
      '',
      '| Role | Name | Hex | Usage |',
      '| --- | --- | --- | --- |',
      '| background | Background | `#FFFFFF` | page |',
      '| accent | Accent | `#315EFB` | links |',
      '| accent-copy | Accent Copy | `#315EFB` | duplicate |',
    ].join('\n');

    const next = replaceDesignMdColorAtIndex(body, 1, '#4E6EF2');

    expect(next).not.toBeNull();
    expect(next).toContain('`#4E6EF2` | links');
    expect(next).toContain('`#315EFB` | duplicate');
  });

  it('returns null for invalid input or a missing color index', () => {
    expect(replaceDesignMdColorAtIndex('# Acme', 0, '#123456')).toBeNull();
    expect(replaceDesignMdColorAtIndex('# Acme\n#FFFFFF', 0, 'blue')).toBeNull();
  });
});
