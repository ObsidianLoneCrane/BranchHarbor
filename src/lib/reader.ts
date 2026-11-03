import { AccountError, native } from './accounts'
import type { RepositoryTarget } from './explorer'

export type Resource = 'pulls' | 'issues'
export type ReaderFilter = 'open' | 'closed' | 'merged' | 'progressing' | 'rejected' | 'all'
export interface WorkItem {
  number: string
  title: string
  state: string
  author: string | null
  labels: string[]
  createdAt: string | null
  updatedAt: string | null
  draft: boolean
}
export interface BranchRef {
  name: string | null
  repository: string | null
}
export interface DiscussionComment {
  id: string
  author: string | null
  body: string
  bodyTruncated: boolean
  createdAt: string | null
  updatedAt: string | null
}
export type ReaderOperation =
  | { kind: 'list'; page: number; state: ReaderFilter }
  | { kind: 'detail'; number: string }
  | { kind: 'comments'; number: string; page: number }
export type ReaderData =
  | { kind: 'list'; items: WorkItem[]; page: number; hasNext: boolean; filtered: boolean }
  | {
      kind: 'detail'
      item: WorkItem
      body: string
      bodyTruncated: boolean
      head: BranchRef | null
      base: BranchRef | null
      mergedAt: string | null
      closedAt: string | null
    }
  | { kind: 'comments'; number: string; items: DiscussionComment[]; page: number; hasNext: boolean }
export type ReaderResult<K extends ReaderData['kind']> = Extract<ReaderData, { kind: K }>
interface ReaderResponse extends RepositoryTarget {
  resource: Resource
  data: ReaderData
}
export function read<K extends ReaderOperation['kind']>(
  target: RepositoryTarget,
  resource: Resource,
  operation: Extract<ReaderOperation, { kind: K }>,
): Promise<ReaderResult<K>>
export async function read(
  target: RepositoryTarget,
  resource: Resource,
  operation: ReaderOperation,
): Promise<ReaderData> {
  const response = await native<ReaderResponse>('read_collaboration', {
    query: { ...target, resource, ...operation },
  })
  if (
    !response ||
    response.accountId !== target.accountId ||
    response.owner !== target.owner ||
    response.name !== target.name ||
    response.resource !== resource ||
    response.data?.kind !== operation.kind
  )
    throw new AccountError('invalidResponse')
  const data = response.data
  if (
    operation.kind === 'detail' &&
    data.kind === 'detail' &&
    data.item.number !== operation.number
  )
    throw new AccountError('invalidResponse')
  if (
    operation.kind === 'comments' &&
    data.kind === 'comments' &&
    (data.number !== operation.number || data.page !== operation.page)
  )
    throw new AccountError('invalidResponse')
  if (operation.kind === 'list' && data.kind === 'list' && data.page !== operation.page)
    throw new AccountError('invalidResponse')
  return data
}
export function stateLabel(state: string) {
  const labels: Record<string, string> = {
    open: 'Open',
    closed: 'Closed',
    merged: 'Merged',
    progressing: 'In progress',
    rejected: 'Rejected',
  }
  return Object.hasOwn(labels, state) ? labels[state]! : 'Unknown'
}
