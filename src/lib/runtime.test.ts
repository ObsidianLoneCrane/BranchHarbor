import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRuntimeInfo } from './runtime'
import { invoke, isTauri } from '@tauri-apps/api/core'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: vi.fn() }))
afterEach(() => vi.resetAllMocks())

describe('runtime information boundary', () => {
  it('does not invoke native commands from the browser preview', async () => {
    vi.mocked(isTauri).mockReturnValue(false)
    expect((await getRuntimeInfo()).platform).toBe('Browser preview')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('uses native information when running in Tauri', async () => {
    vi.mocked(isTauri).mockReturnValue(true)
    vi.mocked(invoke).mockResolvedValue({
      version: '0.1.0',
      platform: 'windows',
      architecture: 'x86_64',
    })
    expect((await getRuntimeInfo()).platform).toBe('windows')
    expect(invoke).toHaveBeenCalledWith('get_runtime_info')
  })

  it('propagates a native failure for the interface to handle', async () => {
    vi.mocked(isTauri).mockReturnValue(true)
    vi.mocked(invoke).mockRejectedValue(new Error('Native command unavailable'))
    await expect(getRuntimeInfo()).rejects.toThrow('Native command unavailable')
  })
})
