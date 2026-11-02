import { afterEach, describe, expect, it, vi } from 'vitest'
import { invoke, isTauri } from '@tauri-apps/api/core'
import {
  AccountError,
  accountError,
  connectAccount,
  disconnectAccount,
  listAccounts,
  listRepositories,
} from './accounts'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: vi.fn() }))
afterEach(() => vi.resetAllMocks())

describe('account command boundary', () => {
  it('does not simulate saved connections or send tokens from browser preview', async () => {
    vi.mocked(isTauri).mockReturnValue(false)
    expect(await listAccounts()).toEqual([])
    await expect(connectAccount('github', 'synthetic')).rejects.toMatchObject({
      code: 'browserUnavailable',
    })
    expect(invoke).not.toHaveBeenCalled()
  })
  it('passes identity expectations and filters to explicit native commands', async () => {
    vi.mocked(isTauri).mockReturnValue(true)
    vi.mocked(invoke).mockResolvedValue(undefined)
    await connectAccount('gitee', 'synthetic', 'gitee:gitee.com:12')
    expect(invoke).toHaveBeenCalledWith('connect_account', {
      provider: 'gitee',
      token: 'synthetic',
      expectedAccountId: 'gitee:gitee.com:12',
    })
    const query = {
      accountId: 'gitee:gitee.com:12',
      page: 2,
      ownership: 'owned' as const,
      visibility: 'private' as const,
    }
    await listRepositories(query)
    expect(invoke).toHaveBeenCalledWith('list_repositories', { query })
    await disconnectAccount(query.accountId)
    expect(invoke).toHaveBeenCalledWith('disconnect_account', { accountId: query.accountId })
  })
  it('only displays known errors and never echoes arbitrary backend text', async () => {
    vi.mocked(isTauri).mockReturnValue(true)
    vi.mocked(invoke).mockRejectedValue('sensitive request data')
    await expect(listAccounts()).rejects.toMatchObject({ code: 'internal' })
    expect(
      accountError({ code: 'unauthorized', message: 'sensitive request data' }).message,
    ).not.toContain('sensitive')
    expect(accountError({ code: 'constructor' }).code).toBe('internal')
    expect(accountError({ code: 'rateLimited', retryAfterSeconds: 45 })).toMatchObject({
      code: 'rateLimited',
      retryAfterSeconds: 45,
    })
    expect(accountError(new AccountError('forbidden')).code).toBe('forbidden')
  })
})
