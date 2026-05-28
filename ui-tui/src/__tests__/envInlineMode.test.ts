import { describe, expect, it } from 'vitest'

import { isInlineModeEnabled } from '../config/env.js'

describe('isInlineModeEnabled', () => {
  it('defaults on inside tmux so tmux copy-mode can use pane history', () => {
    expect(isInlineModeEnabled({ TMUX: '/tmp/tmux-501/default,123,0' } as NodeJS.ProcessEnv)).toBe(true)
  })

  it('keeps direct desktop terminals in AlternateScreen by default', () => {
    expect(isInlineModeEnabled({ TERM_PROGRAM: 'iTerm.app' } as NodeJS.ProcessEnv)).toBe(false)
  })

  it('still defaults on for Termux', () => {
    expect(
      isInlineModeEnabled({
        PREFIX: '/data/data/com.termux/files/usr',
        TERMUX_VERSION: '0.118.0'
      } as NodeJS.ProcessEnv)
    ).toBe(true)
  })

  it('allows explicit override in both directions', () => {
    expect(
      isInlineModeEnabled({
        HERMES_TUI_INLINE: '0',
        TMUX: '/tmp/tmux-501/default,123,0'
      } as NodeJS.ProcessEnv)
    ).toBe(false)

    expect(isInlineModeEnabled({ HERMES_TUI_INLINE: '1', TERM_PROGRAM: 'iTerm.app' } as NodeJS.ProcessEnv)).toBe(
      true
    )
  })
})
