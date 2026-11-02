import type { Page } from '@playwright/test'

// Simulates only the IPC boundary in isolated browser tests. It never contacts a provider or OS vault.
export async function installAccountFixture(
  page: Page,
  options: {
    initial?: boolean
    secondAccount?: boolean
    slowGithub?: boolean
    rateLimit?: boolean
    rateSeconds?: number
  } = {},
) {
  await page.addInitScript((options) => {
    type Connection = {
      id: string
      provider: string
      host: string
      userId: string
      login: string
      name: string
      verifiedAt: number
      credentialStatus: string
    }
    const key = 'branchharbor.test.accounts'
    const connection = (provider: string, login: string): Connection => ({
      id:
        provider +
        ':' +
        (provider === 'github' ? 'github.com' : 'gitee.com') +
        ':' +
        (login === 'alice' ? '1' : '10'),
      provider,
      host: provider === 'github' ? 'github.com' : 'gitee.com',
      userId: login === 'alice' ? '1' : '10',
      login,
      name: login === 'alice' ? 'Alice Sample' : 'Jane Sample',
      verifiedAt: 1793577600,
      credentialStatus: 'saved',
    })
    let accounts: Connection[] =
      JSON.parse(localStorage.getItem(key) || 'null') ??
      (options.initial
        ? [
            connection('github', 'alice'),
            ...(options.secondAccount ? [connection('gitee', 'jane')] : []),
          ]
        : [])
    let repositoryCalls = 0
    Object.defineProperty(window, 'isTauri', { value: true })
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {
        invoke: async (command: string, args: Record<string, unknown> = {}) => {
          if (command === 'get_runtime_info')
            return {
              version: '0.1.0',
              platform: 'Fixture runtime',
              architecture: 'Fixture architecture',
            }
          if (command === 'list_accounts') return accounts
          if (command === 'connect_account') {
            if (args.token === 'invalid-fixture')
              throw { code: 'unauthorized', message: 'Do not echo provider response bodies.' }
            const account = connection(
              String(args.provider),
              args.provider === 'github' ? 'alice' : 'jane',
            )
            if (args.expectedAccountId && args.expectedAccountId !== account.id)
              throw { code: 'accountMismatch' }
            accounts = [...accounts.filter((item) => item.id !== account.id), account]
            localStorage.setItem(key, JSON.stringify(accounts))
            return account
          }
          if (command === 'disconnect_account') {
            accounts = accounts.filter((account) => account.id !== args.accountId)
            localStorage.setItem(key, JSON.stringify(accounts))
            return
          }
          if (command === 'list_repositories') {
            repositoryCalls++
            if (options.rateLimit && repositoryCalls === 1)
              throw { code: 'rateLimited', retryAfterSeconds: options.rateSeconds ?? 2 }
            const query = args.query as {
              accountId: string
              page: number
              visibility: string
              ownership: string
            }
            if (options.slowGithub && query.accountId.startsWith('github:'))
              await new Promise((done) => setTimeout(done, 400))
            const account = accounts.find((item) => item.id === query.accountId)
            if (!account) throw { code: 'accountNotFound' }
            const name =
              query.page === 2
                ? 'second-project'
                : query.visibility === 'private'
                  ? 'private-project'
                  : 'workspace'
            return {
              accountId: account.id,
              page: query.page,
              hasNext: query.page === 1 && query.visibility !== 'private',
              accessNotice: 'Fixture coverage only',
              items: [
                {
                  id: account.id + ':' + query.page,
                  name,
                  fullName: account.login + '/' + name,
                  description: 'Synthetic repository used only for automated UI checks.',
                  visibility: query.visibility === 'private' ? 'private' : 'public',
                  owner: account.login,
                  owned: true,
                  language: 'Rust',
                  defaultBranch: 'main',
                  updatedAt: '2026-11-02T00:00:00Z',
                  archived: false,
                },
              ],
            }
          }
          throw new Error('Unexpected fixture command')
        },
      },
    })
  }, options)
}
