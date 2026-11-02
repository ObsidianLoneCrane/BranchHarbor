import { readonly, ref } from 'vue'
import * as api from '../lib/accounts'

type AccountApi = Pick<typeof api, 'listAccounts' | 'connectAccount' | 'disconnectAccount'>

export function createAccountsStore(bridge: AccountApi = api) {
  const accounts = ref<api.Account[]>([])
  const loading = ref(false)
  const pending = ref(false)
  const error = ref<api.AccountError | null>(null)
  const loaded = ref(false)
  let revision = 0
  let active: Promise<void> | null = null

  function refresh() {
    const generation = ++revision
    loading.value = true
    error.value = null
    active = bridge
      .listAccounts()
      .then((items) => {
        if (generation === revision) {
          accounts.value = items
          loaded.value = true
        }
      })
      .catch((cause) => {
        if (generation === revision) error.value = api.accountError(cause)
      })
      .finally(() => {
        if (generation === revision) {
          loading.value = false
          active = null
        }
      })
    return active
  }
  function ensureLoaded() {
    return loaded.value ? Promise.resolve() : (active ?? refresh())
  }
  async function connect(provider: api.Provider, token: string, expected?: string) {
    if (pending.value) throw new api.AccountError('internal')
    pending.value = true
    try {
      const account = await bridge.connectAccount(provider, token, expected)
      revision++
      loading.value = false
      active = null
      loaded.value = true
      error.value = null
      accounts.value = [...accounts.value.filter((item) => item.id !== account.id), account].sort(
        (a, b) => a.provider.localeCompare(b.provider) || a.login.localeCompare(b.login),
      )
      return account
    } finally {
      pending.value = false
    }
  }
  async function disconnect(id: string) {
    if (pending.value) throw new api.AccountError('internal')
    pending.value = true
    try {
      await bridge.disconnectAccount(id)
      revision++
      loading.value = false
      active = null
      accounts.value = accounts.value.filter((item) => item.id !== id)
    } finally {
      pending.value = false
    }
  }
  return {
    accounts: readonly(accounts),
    loading: readonly(loading),
    loaded: readonly(loaded),
    pending: readonly(pending),
    error: readonly(error),
    refresh,
    ensureLoaded,
    connect,
    disconnect,
  }
}

const accounts = createAccountsStore()
export function useAccounts() {
  return accounts
}
