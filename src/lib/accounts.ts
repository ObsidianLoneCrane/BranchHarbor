import { invoke, isTauri } from '@tauri-apps/api/core'

export type Provider = 'github' | 'gitee'
export interface Account {
  id: string
  provider: Provider
  host: string
  userId: string
  login: string
  name: string | null
  verifiedAt: number
  credentialStatus: 'saved' | 'missing' | 'unavailable'
}
export interface Repository {
  id: string
  name: string
  fullName: string
  description: string | null
  visibility: string
  owner: string
  owned: boolean
  language: string | null
  defaultBranch: string | null
  updatedAt: string | null
  archived: boolean
}
export interface RepositoryQuery {
  accountId: string
  page: number
  ownership: 'all' | 'owned'
  visibility: 'all' | 'public' | 'private'
}
export interface RepositoryPage {
  accountId: string
  items: Repository[]
  page: number
  hasNext: boolean
  accessNotice: string
}

const messages: Record<string, string> = {
  invalidInput: 'Enter a valid personal access token without whitespace.',
  unauthorized: 'The token is invalid or expired. Update the account token in Settings.',
  forbidden: 'The token does not allow this request. Check its account and repository permissions.',
  rateLimited: 'The provider rate limit was reached. Please wait before refreshing.',
  network: 'The provider could not be reached. Check your connection and try again.',
  credentialMissing: 'The saved token is missing. Update the account token in Settings.',
  credentialUnavailable:
    'Secure storage is unavailable or locked. Unlock your system credential store and retry.',
  accountNotFound: 'This account connection no longer exists. Refresh your accounts.',
  accountMismatch:
    'This token belongs to another account. Use Add account to connect it separately.',
  storage: 'Local account data could not be accessed. Check disk space and file permissions.',
  invalidResponse: 'The provider returned an unexpected response. Please try again later.',
  invalidRepositoryInput: 'The repository, branch, or object reference is invalid.',
  invalidReaderInput:
    'The repository, item number, state, or page is invalid. Choose another filter or return to the list.',
  resourceUnavailable:
    'This repository, branch, or file is unavailable or not permitted by the token. Refresh the repository or check account permissions.',
  responseTooLarge: 'The provider response exceeds the supported size. Try a smaller directory.',
  provider: 'The provider could not complete the request. Please try again later.',
  browserUnavailable:
    'Account connections are available in the desktop app. Browser preview does not store tokens.',
  internal: 'The operation could not be completed. Please try again.',
}

export class AccountError extends Error {
  constructor(
    public code: string,
    public retryAfterSeconds: number | null = null,
  ) {
    super(messages[code] ?? messages.internal)
    this.name = 'AccountError'
  }
}

export function accountError(error: unknown): AccountError {
  if (error instanceof AccountError) return error
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    Object.hasOwn(messages, error.code)
  ) {
    const seconds =
      'retryAfterSeconds' in error &&
      typeof error.retryAfterSeconds === 'number' &&
      Number.isFinite(error.retryAfterSeconds)
        ? Math.max(0, error.retryAfterSeconds)
        : null
    return new AccountError(error.code, seconds)
  }
  // Never echo arbitrary native errors: their text may contain request or credential data.
  return new AccountError('internal')
}

export function hasNativeAccounts() {
  return isTauri()
}
export async function native<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!hasNativeAccounts()) throw new AccountError('browserUnavailable')
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    throw accountError(error)
  }
}
export async function listAccounts(): Promise<Account[]> {
  if (!hasNativeAccounts()) return []
  return native('list_accounts')
}
export function connectAccount(
  provider: Provider,
  token: string,
  expectedAccountId?: string,
): Promise<Account> {
  return native('connect_account', {
    provider,
    token,
    expectedAccountId: expectedAccountId ?? null,
  })
}
export function disconnectAccount(accountId: string): Promise<void> {
  return native('disconnect_account', { accountId })
}
export function listRepositories(query: RepositoryQuery): Promise<RepositoryPage> {
  return native('list_repositories', { query })
}
export function providerName(provider: Provider) {
  return provider === 'github' ? 'GitHub' : 'Gitee'
}
