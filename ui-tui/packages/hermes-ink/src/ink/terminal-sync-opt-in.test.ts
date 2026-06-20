import { afterEach, describe, expect, it, vi } from 'vitest'

import { isSynchronizedOutputSupported } from './terminal.js'

describe('isSynchronizedOutputSupported — HERMES_TUI_SYNC_OUTPUT opt-in', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('forces sync output on even inside tmux when explicitly opted in', () => {
    vi.stubEnv('TMUX', '/tmp/tmux-1000/default,123,0')
    vi.stubEnv('HERMES_TUI_SYNC_OUTPUT', '1')

    expect(isSynchronizedOutputSupported()).toBe(true)
  })

  it('accepts the usual truthy spellings', () => {
    vi.stubEnv('TMUX', '/tmp/tmux-1000/default,123,0')

    for (const v of ['1', 'true', 'yes', 'on', 'TRUE']) {
      vi.stubEnv('HERMES_TUI_SYNC_OUTPUT', v)
      expect(isSynchronizedOutputSupported()).toBe(true)
    }
  })

  it('keeps the deliberate tmux skip when not opted in', () => {
    vi.stubEnv('TMUX', '/tmp/tmux-1000/default,123,0')
    vi.stubEnv('HERMES_TUI_SYNC_OUTPUT', '')

    expect(isSynchronizedOutputSupported()).toBe(false)
  })
})
