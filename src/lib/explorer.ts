import { AccountError, native } from './accounts'

export interface RepositoryTarget {
  accountId: string
  owner: string
  name: string
}
export interface Branch {
  name: string
  commit: { sha: string }
  protected: boolean
}
export interface TreeEntry {
  path: string
  mode: string
  type: string
  sha: string
  size: number | null
}
export type Operation =
  | { kind: 'detail' }
  | { kind: 'branches'; page: number }
  | { kind: 'branch'; branch: string }
  | { kind: 'directory'; sha: string }
  | { kind: 'file'; sha: string; size: number }
export type ExplorerData =
  | {
      kind: 'detail'
      id: string
      fullName: string
      description: string | null
      defaultBranch: string | null
      visibility: string
      archived: boolean
    }
  | { kind: 'branches'; items: Branch[]; page: number; hasNext: boolean }
  | { kind: 'branch'; name: string; commitSha: string; treeSha: string }
  | { kind: 'directory'; sha: string; items: TreeEntry[]; truncated: boolean }
  | {
      kind: 'file'
      sha: string
      size: number
      status: 'text' | 'binary' | 'tooLarge' | 'unsupportedEncoding'
      text: string | null
    }
export type Data<K extends ExplorerData['kind']> = Extract<ExplorerData, { kind: K }>
export interface ExplorerResponse extends RepositoryTarget {
  data: ExplorerData
}
export async function explore<K extends Operation['kind']>(
  target: RepositoryTarget,
  operation: Extract<Operation, { kind: K }>,
): Promise<Data<K>> {
  const response = await native<ExplorerResponse>('explore_repository', {
    query: { ...target, ...operation },
  })
  if (
    response.accountId !== target.accountId ||
    response.owner !== target.owner ||
    response.name !== target.name ||
    response.data.kind !== operation.kind
  )
    throw new AccountError('invalidResponse')
  return response.data as Data<K>
}
