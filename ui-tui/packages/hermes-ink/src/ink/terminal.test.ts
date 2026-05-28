import { describe, expect, it } from 'vitest'

import { shouldEnableKittyKeyboard, shouldEnableModifyOtherKeys, needsAltScreenResizeScrollbackClear } from './terminal.js'

describe('terminal resize quirks', () => {
  it('uses a deeper alt-screen resize clear for Apple Terminal', () => {
    expect(needsAltScreenResizeScrollbackClear({ TERM_PROGRAM: 'Apple_Terminal' })).toBe(true)
    expect(needsAltScreenResizeScrollbackClear({ TERM_PROGRAM: ' Apple_Terminal ' })).toBe(true)
  })

  it('keeps the normal resize repaint path for modern terminals', () => {
    expect(needsAltScreenResizeScrollbackClear({ TERM_PROGRAM: 'vscode' })).toBe(false)
    expect(needsAltScreenResizeScrollbackClear({ TERM_PROGRAM: 'iTerm.app' })).toBe(false)
  })
})

describe('extended keyboard modes', () => {
  it('does not push Kitty keyboard mode through tmux to the outer terminal', () => {
    expect(shouldEnableKittyKeyboard({ TMUX: '/tmp/tmux-501/default,123,0' }, 'iTerm.app')).toBe(false)
  })

  it('still enables tmux-native modifyOtherKeys for app-level shortcuts inside tmux', () => {
    expect(shouldEnableModifyOtherKeys('iTerm.app')).toBe(true)
  })

  it('enables Kitty keyboard mode directly in allowlisted non-tmux terminals', () => {
    expect(shouldEnableKittyKeyboard({}, 'iTerm.app')).toBe(true)
  })
})
