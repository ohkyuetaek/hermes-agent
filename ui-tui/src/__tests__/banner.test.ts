import { describe, expect, it } from 'vitest'

import { artWidth, CADUCEUS_WIDTH, LOGO_WIDTH } from '../banner.js'

describe('banner art width uses display width, not code-unit length', () => {
  it('counts CJK glyphs by terminal cells (2 each), not .length (1 each)', () => {
    // Old `.length` impl would return 2; display width is 4.
    expect(artWidth([['', '가나']])).toBe(4)
    expect(artWidth([['', 'ab가']])).toBe(4)
  })

  it('is a no-op for the default ASCII box-drawing logo (ambiguous = narrow by default)', () => {
    // The default LOGO_ART rows are box-drawing/block glyphs; with the default
    // narrow ambiguous setting their display width equals their .length, so the
    // wide multi-row banner still measures the same as before this change.
    expect(LOGO_WIDTH).toBeGreaterThan(90)
    expect(CADUCEUS_WIDTH).toBeGreaterThan(0)
  })

  it('takes the max display width across lines', () => {
    expect(artWidth([['', 'a'], ['', '가나다']])).toBe(6)
  })
})
