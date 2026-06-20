import { describe, expect, it } from 'vitest'

import { compactPreview } from './text.js'

describe('compactPreview non-positive budget guard', () => {
  it('returns empty for negative or zero budgets instead of garbled output', () => {
    // Regression: a caller doing `width - 28 - depth*2` on a narrow pane can go
    // negative; the old `slice(0, max - 1)` then indexed from the end and
    // emitted over-budget garbage. Must clamp to an empty preview.
    expect(compactPreview('fix the parser bug', -8)).toBe('')
    expect(compactPreview('fix the parser bug', 0)).toBe('')
    expect(compactPreview('fix the parser bug', -1)).toBe('')
  })

  it('still truncates with an ellipsis for positive budgets', () => {
    expect(compactPreview('hello world', 4)).toBe('hel…')
    expect(compactPreview('hi', 10)).toBe('hi')
    expect(compactPreview('   spaced   out   ', 5)).toBe('spac…')
  })

  it('returns empty for blank input', () => {
    expect(compactPreview('   ', 10)).toBe('')
  })
})
