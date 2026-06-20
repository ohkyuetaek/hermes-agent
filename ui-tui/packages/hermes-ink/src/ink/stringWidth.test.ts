import { describe, expect, it } from 'vitest'

import { resolveAmbiguousAsWide, stringWidth, stringWidthJavaScript } from './stringWidth.js'

describe('resolveAmbiguousAsWide', () => {
  it('defaults to narrow when the env var is absent or empty', () => {
    expect(resolveAmbiguousAsWide({})).toBe(false)
    expect(resolveAmbiguousAsWide({ HERMES_TUI_AMBIGUOUS_WIDTH: '' })).toBe(false)
    expect(resolveAmbiguousAsWide({ HERMES_TUI_AMBIGUOUS_WIDTH: 'narrow' })).toBe(false)
  })

  it('treats wide/2/double (any case, trimmed) as opt-in to wide', () => {
    expect(resolveAmbiguousAsWide({ HERMES_TUI_AMBIGUOUS_WIDTH: 'wide' })).toBe(true)
    expect(resolveAmbiguousAsWide({ HERMES_TUI_AMBIGUOUS_WIDTH: 'WIDE' })).toBe(true)
    expect(resolveAmbiguousAsWide({ HERMES_TUI_AMBIGUOUS_WIDTH: ' 2 ' })).toBe(true)
    expect(resolveAmbiguousAsWide({ HERMES_TUI_AMBIGUOUS_WIDTH: 'double' })).toBe(true)
  })
})

describe('stringWidthJavaScript ambiguous-width threading', () => {
  // U+2500 BOX DRAWINGS LIGHT HORIZONTAL is East-Asian *Ambiguous*: the flag
  // is the entire point of this fix (terminals that draw it 2 cells wide).
  it('measures ambiguous box-drawing as 1 narrow / 2 wide', () => {
    expect(stringWidthJavaScript('─', false)).toBe(1)
    expect(stringWidthJavaScript('─', true)).toBe(2)
    expect(stringWidthJavaScript('────────', false)).toBe(8)
    expect(stringWidthJavaScript('────────', true)).toBe(16)
  })

  it('leaves unambiguous wide CJK at 2 in both modes', () => {
    // Hangul syllables are East-Asian Wide regardless of the ambiguous flag —
    // confirms the fix does NOT touch CJK letters themselves.
    expect(stringWidthJavaScript('가', false)).toBe(2)
    expect(stringWidthJavaScript('가', true)).toBe(2)
  })

  it('leaves plain ASCII at 1 in both modes', () => {
    expect(stringWidthJavaScript('Hello', false)).toBe(5)
    expect(stringWidthJavaScript('Hello', true)).toBe(5)
  })
})

describe('stringWidth (public, cached path)', () => {
  it('handles ASCII fast-path identically', () => {
    expect(stringWidth('hermes')).toBe(6)
    expect(stringWidth('')).toBe(0)
  })
})
