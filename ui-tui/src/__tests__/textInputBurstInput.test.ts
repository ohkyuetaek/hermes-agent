import { describe, expect, it } from 'vitest'

import {
  applyLeadingImeSpaceBeforeText,
  applyPendingImeSpaceAfterText,
  applyPrintableInsert,
  imeSpaceDelayMs,
  shouldBatchPrintableBurstCommit,
  shouldDeferImeSpace,
  shouldRouteMultiCharInputAsPaste
} from '../components/textInput.js'

describe('applyPrintableInsert', () => {
  it('applies non-bracketed multi-character bursts immediately', () => {
    const burst = applyPrintableInsert('abc', 3, 'xxxxx')

    const repeated = [...'xxxxx'].reduce(
      (state, ch) => applyPrintableInsert(state.value, state.cursor, ch)!,
      { cursor: 3, value: 'abc' }
    )

    expect(burst).toEqual({ cursor: 8, value: 'abcxxxxx' })
    expect(burst).toEqual(repeated)
  })

  it('replaces the selected range for burst input', () => {
    expect(applyPrintableInsert('abZZef', 4, 'cd', { end: 4, start: 2 })).toEqual({
      cursor: 4,
      value: 'abcdef'
    })
  })

  it('rejects control or escape-bearing input', () => {
    expect(applyPrintableInsert('abc', 3, '\x1b[200~pasted')).toBeNull()
    expect(applyPrintableInsert('abc', 3, '\t')).toBeNull()
  })
})

describe('Korean IME pending-space ordering', () => {
  it('uses a slightly longer default delay for macOS/tmux IME commit jitter', () => {
    expect(imeSpaceDelayMs()).toBe(96)
    expect(imeSpaceDelayMs({ HERMES_TUI_IME_SPACE_DELAY_MS: '160' } as NodeJS.ProcessEnv)).toBe(160)
    expect(imeSpaceDelayMs({ HERMES_TUI_IME_SPACE_DELAY_MS: '8' } as NodeJS.ProcessEnv)).toBe(96)
    expect(imeSpaceDelayMs({ HERMES_TUI_IME_SPACE_DELAY_MS: '800' } as NodeJS.ProcessEnv)).toBe(500)
  })

  it('briefly defers Hangul-following Space by default to catch same-burst late IME commits', () => {
    expect(shouldDeferImeSpace('지금', '지금'.length, ' ', null)).toBe(true)
    expect(shouldDeferImeSpace('지금도', '지금도'.length, ' ', null)).toBe(true)
  })

  it('allows disabling Hangul pending-space reorder for terminals with native-safe ordering', () => {
    expect(
      shouldDeferImeSpace('지금', '지금'.length, ' ', null, {
        HERMES_TUI_DISABLE_IME_SPACE_REORDER: '1'
      } as NodeJS.ProcessEnv)
    ).toBe(false)
  })

  it('does not defer ASCII spaces away from Hangul composition edges', () => {
    expect(shouldDeferImeSpace('hello', 5, ' ', null)).toBe(false)
    expect(shouldDeferImeSpace('지금', 1, ' ', null)).toBe(false)
    expect(shouldDeferImeSpace('지금', '지금'.length, 'x', null)).toBe(false)
    expect(shouldDeferImeSpace('지금', '지금'.length, ' ', { end: 1, start: 0 })).toBe(false)
  })

  it('reorders a deferred space after the late Korean syllable that committed it', () => {
    expect(applyPendingImeSpaceAfterText('지금', '지금'.length, '도')).toEqual({
      cursor: '지금도 '.length,
      value: '지금도 '
    })
  })

  it('reorders a leading Space bundled before a late Korean IME commit', () => {
    expect(applyLeadingImeSpaceBeforeText('지금', '지금'.length, ' 도')).toEqual({
      cursor: '지금도 '.length,
      value: '지금도 '
    })
  })

  it('does not reorder ordinary leading spaces outside Hangul IME edges', () => {
    expect(applyLeadingImeSpaceBeforeText('hello', 5, ' world')).toBeNull()
    expect(applyLeadingImeSpaceBeforeText('지금', 1, ' 도')).toBeNull()
    expect(applyLeadingImeSpaceBeforeText('지금', '지금'.length, ' 도', { end: 1, start: 0 })).toBeNull()
  })
})

describe('shouldBatchPrintableBurstCommit', () => {
  it('batches plain ASCII bursts for typing throughput', () => {
    expect(shouldBatchPrintableBurstCommit('xxxxx')).toBe(true)
    expect(shouldBatchPrintableBurstCommit('hello world')).toBe(true)
  })

  it('does not batch IME/non-ASCII bursts such as Korean syllable plus space', () => {
    expect(shouldBatchPrintableBurstCommit('요 ')).toBe(false)
    expect(shouldBatchPrintableBurstCommit('안녕')).toBe(false)
  })
})

describe('shouldRouteMultiCharInputAsPaste', () => {
  it('keeps newline-bearing chunks on the paste path', () => {
    expect(shouldRouteMultiCharInputAsPaste('hello\nworld')).toBe(true)
    expect(shouldRouteMultiCharInputAsPaste('hello\r\nworld'.replace(/\r\n/g, '\n'))).toBe(true)
  })

  it('treats repeated printable key bursts as immediate input', () => {
    expect(shouldRouteMultiCharInputAsPaste('xxxxx')).toBe(false)
  })
})
