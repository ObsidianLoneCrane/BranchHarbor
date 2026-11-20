import { invoke, isTauri } from '@tauri-apps/api/core'

export interface LocalRepository {
  id: number
  path: string
}

export interface LocalActivity {
  day: string
  commits: {
    repositoryId: number
    repositoryPath: string
    hash: string
    committedAt: number
    author: string
    subject: string
  }[]
  skippedRepositories: number
  limited: boolean
}

export function readLocalActivity(day: string): Promise<LocalActivity> {
  return invoke('read_local_activity', { day })
}

export interface LocalChange {
  path: string
  index: string
  worktree: string
}

export interface LocalRemote {
  name: string
  fetchUrl: string | null
  pushUrl: string | null
}

export interface LocalSnapshot {
  branch: string | null
  head: string | null
  upstream: string | null
  ahead: number | null
  behind: number | null
  branches: string[]
  author: string | null
  changes: LocalChange[]
  remotes: LocalRemote[]
}

type AddRepository =
  { kind: 'import' | 'create'; path: string } | { kind: 'clone'; path: string; url: string }

export type LocalOperation =
  | { kind: 'stage' | 'unstage'; path: string }
  | { kind: 'commit'; message: string; author: string }
  | { kind: 'createBranch'; name: string; start: string }
  | { kind: 'switchBranch' | 'deleteBranch'; name: string }
  | { kind: 'addRemote'; name: string; url: string }
  | { kind: 'fetch'; remote: string; url: string }
  | { kind: 'pull'; remote: string; url: string; branch: string; localBranch: string }
  | {
      kind: 'push'
      remote: string
      url: string
      branch: string
      localBranch: string
      track: boolean
    }

const errors: Record<string, string> = {
  invalidInput: 'Check the folder, file, or branch name and try again.',
  invalidRepository: 'This folder is not within an accessible Git working tree.',
  missingFolder: 'This folder is missing or inaccessible. If it moved, import the new location.',
  directoryNotEmpty: 'Choose a new or empty destination folder.',
  notRegistered: 'This repository is no longer in the local list.',
  storage: 'Local repository registrations could not be accessed. Check disk permissions.',
  gitMissing: 'Install Git or add it to the desktop app’s environment, then reopen BranchHarbor.',
  gitFailed:
    'Git could not complete this operation. Refresh the repository and check it in a terminal.',
  busy: 'Git is busy. Wait for the other operation to finish, then refresh.',
  ownership: 'Git rejected this folder’s ownership. Check the repository with Git in a terminal.',
  unsupportedText: 'Git returned paths or metadata that are not valid UTF-8.',
  tooLarge: 'Git returned more repository data than this view supports.',
  authorMissing: 'Set or verify the Git author name and email, then refresh before committing.',
  diverged: 'The branches have diverged. Reconcile their histories in Git before pulling again.',
  unmergedBranch: 'Git refused to delete a branch with unmerged commits.',
  workingTreeConflict:
    'Local changes or conflicts prevent this operation. Review the working tree.',
  authentication: 'Git authentication failed. Check your Git credential helper or SSH agent.',
  pushRejected: 'The remote rejected the push. Fetch and review the target branch before retrying.',
  network: 'Git could not reach the remote. Check the address and your connection.',
  timedOut: 'Git timed out. Refresh and check the repository and remote before retrying.',
  invalidRemote:
    'Review the remote address. Use a single HTTPS, SSH, or absolute filesystem target without embedded credentials.',
  noChanges: 'The selected change is no longer available, or there are no staged changes.',
  branchChanged: 'The current branch changed. Refresh and confirm the target again.',
}

export function localGitError(error: unknown): string {
  return typeof error === 'string' && Object.hasOwn(errors, error)
    ? errors[error]
    : errors.gitFailed
}

export function hasLocalGit() {
  return isTauri()
}

export function displayLocalPath(path: string) {
  if (path.startsWith('\\\\?\\UNC\\')) return '\\\\' + path.slice(8)
  return path.startsWith('\\\\?\\') ? path.slice(4) : path
}

export function localRepositoryName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

export function listLocal(): Promise<LocalRepository[]> {
  return invoke('list_local_repositories')
}

export function addLocal(request: AddRepository): Promise<LocalRepository> {
  return invoke('add_local_repository', { request })
}

export function removeLocal(id: number): Promise<void> {
  return invoke('remove_local_repository', { id })
}

export function readLocal(id: number): Promise<LocalSnapshot> {
  return invoke('read_local_repository', { id })
}

export function readLocalDiff(
  id: number,
  path: string,
  staged: boolean,
): Promise<{ text: string; truncated: boolean }> {
  return invoke('read_local_diff', { id, path, staged })
}

export function changeLocal(id: number, operation: LocalOperation): Promise<void> {
  return invoke('change_local_repository', { id, operation })
}
