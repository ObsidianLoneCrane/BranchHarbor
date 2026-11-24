import {
  accountError,
  AccountError,
  listRepositories,
  type RepositoryPage,
  type RepositoryQuery,
} from './accounts'
import { registerSessionCache, sessionCache } from './sessionCache'

export const repositoryPages = sessionCache<RepositoryPage>(40, 60_000, 10 * 60_000, true)
let cooldowns = new Map<string, number>()
registerSessionCache(() => {
  cooldowns = new Map()
})

export function repositoryPageKey({ accountId, page, ownership, visibility }: RepositoryQuery) {
  return JSON.stringify([accountId, page, ownership, visibility])
}

export function loadRepositoryPage(query: RepositoryQuery, force = false) {
  return repositoryPages.load(
    repositoryPageKey(query),
    async () => {
      const deadlines = cooldowns
      const remaining = Math.ceil(((deadlines.get(query.accountId) ?? 0) - Date.now()) / 1000)
      if (remaining > 0) throw new AccountError('rateLimited', remaining)
      deadlines.delete(query.accountId)
      try {
        const data = await listRepositories(query)
        if (data.accountId !== query.accountId || data.page !== query.page)
          throw new AccountError('invalidResponse')
        return data
      } catch (cause) {
        const error = accountError(cause)
        if (error.code === 'rateLimited') {
          deadlines.set(query.accountId, Date.now() + (error.retryAfterSeconds ?? 60) * 1000)
        }
        throw error
      }
    },
    force,
  )
}
