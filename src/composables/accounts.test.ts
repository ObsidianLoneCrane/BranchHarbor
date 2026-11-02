import { describe, expect, it, vi } from 'vitest'
import { createAccountsStore } from './accounts'
import { AccountError, type Account } from '../lib/accounts'

const alice: Account = {
  id: 'github:github.com:1',
  provider: 'github',
  host: 'github.com',
  userId: '1',
  login: 'alice',
  name: 'Alice',
  verifiedAt: 1,
  credentialStatus: 'saved',
}
function fixture() {
  const api = {
    listAccounts: vi.fn<() => Promise<Account[]>>().mockResolvedValue([]),
    connectAccount: vi.fn().mockResolvedValue(alice),
    disconnectAccount: vi.fn().mockResolvedValue(undefined),
  }
  return { api, store: createAccountsStore(api) }
}

describe('shared account state', () => {
  it('coalesces initial loading and replaces an existing identity when reconnected', async () => {
    const { api, store } = fixture()
    const first = store.ensureLoaded()
    const second = store.ensureLoaded()
    await Promise.all([first, second])
    expect(api.listAccounts).toHaveBeenCalledTimes(1)
    await store.connect('github', 'fixture-one')
    await store.connect('github', 'fixture-two', alice.id)
    expect(store.accounts.value).toHaveLength(1)
    expect(JSON.stringify(store.accounts.value)).not.toContain('fixture-two')
    expect(store.pending.value).toBe(false)
  })
  it('does not let an old account refresh undo a later successful connection', async () => {
    const { api, store } = fixture()
    let resolve!: (accounts: Account[]) => void
    api.listAccounts.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const oldRefresh = store.refresh()
    await store.connect('github', 'fixture')
    resolve([])
    await oldRefresh
    expect(store.accounts.value[0]?.id).toBe(alice.id)
  })
  it('retains an account when credential deletion fails and removes it only on success', async () => {
    const { api, store } = fixture()
    await store.connect('github', 'fixture')
    api.disconnectAccount.mockRejectedValueOnce(new AccountError('credentialUnavailable'))
    await expect(store.disconnect(alice.id)).rejects.toMatchObject({
      code: 'credentialUnavailable',
    })
    expect(store.accounts.value).toHaveLength(1)
    expect(store.pending.value).toBe(false)
    await store.disconnect(alice.id)
    expect(store.accounts.value).toHaveLength(0)
  })
  it('does not destroy existing connections when refreshing metadata fails', async () => {
    const { api, store } = fixture()
    await store.connect('github', 'fixture')
    api.listAccounts.mockRejectedValue(new AccountError('storage'))
    await store.refresh()
    expect(store.accounts.value).toHaveLength(1)
    expect(store.error.value?.code).toBe('storage')
    expect(store.loading.value).toBe(false)
  })
})
