import { computed, reactive } from 'vue'
import { accountError, AccountError, type AccountError as ErrorType } from '../lib/accounts'
import {
  explore,
  type Data,
  type RepositoryTarget,
  type TreeEntry,
  type Operation,
  type ExplorerData,
} from '../lib/explorer'

export interface Crumb {
  name: string
  sha: string
}
export type ExplorerBridge = (
  target: RepositoryTarget,
  operation: Operation,
) => Promise<ExplorerData>
export function createExplorer(bridge: ExplorerBridge = explore) {
  const state = reactive({
    target: null as RepositoryTarget | null,
    detail: null as Data<'detail'> | null,
    branches: [] as Data<'branches'>['items'],
    branchPage: 1,
    hasNext: false,
    selectedBranch: '',
    revision: null as Data<'branch'> | null,
    crumbs: [] as Crumb[],
    directory: null as Data<'directory'> | null,
    entry: null as TreeEntry | null,
    preview: null as Data<'file'> | null,
    special: '',
    busy: '',
    error: null as ErrorType | null,
    empty: false,
    now: Date.now(),
  })
  let generation = 0
  let retryAction: (() => Promise<void>) | null = null
  let timer: ReturnType<typeof setInterval> | undefined
  const cooldowns = reactive(new Map<string, number>())
  const remaining = computed(() =>
    Math.max(
      0,
      Math.ceil(((cooldowns.get(state.target?.accountId ?? '') ?? 0) - state.now) / 1000),
    ),
  )
  async function request<K extends Parameters<typeof explore>[1]['kind']>(
    target: RepositoryTarget,
    operation: Parameters<typeof explore<K>>[1],
  ) {
    const seconds = Math.ceil(((cooldowns.get(target.accountId) ?? 0) - Date.now()) / 1000)
    if (seconds > 0) throw new AccountError('rateLimited', seconds)
    const response = await bridge(target, operation)
    if (response.kind !== operation.kind) throw new AccountError('invalidResponse')
    return response as Data<K>
  }
  async function run(
    kind: string,
    retry: () => Promise<void>,
    action: (ticket: number) => Promise<void>,
  ) {
    const ticket = ++generation
    state.busy = kind
    state.error = null
    retryAction = retry
    try {
      await action(ticket)
    } catch (cause) {
      if (ticket !== generation) return
      state.error = accountError(cause)
      if (state.error.code === 'rateLimited' && state.target) {
        cooldowns.set(
          state.target.accountId,
          Date.now() + (state.error.retryAfterSeconds ?? 60) * 1000,
        )
        state.now = Date.now()
        timer ??= setInterval(() => {
          state.now = Date.now()
          if (![...cooldowns.values()].some((value) => value > state.now)) {
            clearInterval(timer)
            timer = undefined
          }
        }, 1000)
      }
    } finally {
      if (ticket === generation) state.busy = ''
    }
  }
  async function resolve(target: RepositoryTarget, branch: string, ticket: number) {
    const revision = await request(target, { kind: 'branch', branch })
    if (ticket !== generation) return
    if (revision.name !== branch) throw new AccountError('invalidResponse')
    state.revision = revision
    state.crumbs = [{ name: state.detail?.fullName ?? target.name, sha: revision.treeSha }]
    const directory = await request(target, { kind: 'directory', sha: revision.treeSha })
    if (ticket === generation) {
      if (directory.sha !== revision.treeSha) throw new AccountError('invalidResponse')
      state.directory = directory
    }
  }
  function resetContent() {
    state.revision = null
    state.crumbs = []
    state.directory = null
    state.entry = null
    state.preview = null
    state.special = ''
  }
  async function open(target: RepositoryTarget, preferredBranch = '') {
    state.target = { ...target }
    state.detail = null
    state.branches = []
    state.empty = false
    state.selectedBranch = ''
    state.branchPage = 1
    state.hasNext = false
    resetContent()
    await run(
      'initial',
      () => open(target, preferredBranch),
      async (ticket) => {
        const detail = await request(target, { kind: 'detail' })
        if (ticket !== generation) return
        state.detail = detail
        const branches = await request(target, { kind: 'branches', page: 1 })
        if (ticket !== generation) return
        state.branches = branches.items
        state.hasNext = branches.hasNext
        if (!branches.items.length) {
          state.empty = true
          return
        }
        state.selectedBranch = preferredBranch || detail.defaultBranch || branches.items[0]!.name
        await resolve(target, state.selectedBranch, ticket)
      },
    )
  }
  async function selectBranch(branch: string) {
    const target = state.target
    if (!target) return
    state.selectedBranch = branch
    resetContent()
    state.empty = false
    await run(
      'branch',
      () => selectBranch(branch),
      (ticket) => resolve(target, branch, ticket),
    )
  }
  async function branchPage(page: number) {
    const target = state.target
    if (!target) return
    await run(
      'branches',
      () => branchPage(page),
      async (ticket) => {
        const response = await request(target, { kind: 'branches', page })
        if (ticket === generation) {
          state.branches = response.items
          state.branchPage = response.page
          state.hasNext = response.hasNext
        }
      },
    )
  }
  async function directory(crumbs: Crumb[]) {
    const target = state.target
    const last = crumbs.at(-1)
    if (!target || !last) return
    state.crumbs = [...crumbs]
    state.directory = null
    state.entry = null
    state.preview = null
    state.special = ''
    await run(
      'directory',
      () => directory(crumbs),
      async (ticket) => {
        const result = await request(target, { kind: 'directory', sha: last.sha })
        if (ticket === generation) {
          if (result.sha !== last.sha) throw new AccountError('invalidResponse')
          state.directory = result
        }
      },
    )
  }
  async function selectEntry(entry: TreeEntry) {
    const target = state.target
    if (!target) return
    if (entry.type === 'tree')
      return directory([...state.crumbs, { name: entry.path, sha: entry.sha }])
    state.entry = entry
    state.preview = null
    state.special = ''
    if (entry.mode === '120000' || entry.type !== 'blob') {
      generation++
      state.busy = ''
      state.error = null
      state.special =
        entry.mode === '120000' ? 'symlink' : entry.type === 'commit' ? 'submodule' : 'unsupported'
      return
    }
    await run(
      'file',
      () => selectEntry(entry),
      async (ticket) => {
        const result = await request(target, {
          kind: 'file',
          sha: entry.sha,
          size: entry.size ?? 0,
        })
        if (ticket === generation) {
          if (result.sha !== entry.sha) throw new AccountError('invalidResponse')
          state.preview = result
        }
      },
    )
  }
  return {
    state,
    remaining,
    open,
    selectBranch,
    branchPage,
    directory,
    selectEntry,
    retry: async () => {
      await retryAction?.()
    },
    refresh: async () => {
      if (state.target) await open({ ...state.target }, state.selectedBranch)
    },
    dispose: () => {
      generation++
      clearInterval(timer)
    },
  }
}
