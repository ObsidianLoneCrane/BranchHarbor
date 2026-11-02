import { describe, expect, it, vi } from 'vitest'
import { createExplorer, type ExplorerBridge } from './explorer'
import { type Data, type TreeEntry } from '../lib/explorer'

const target = { accountId: 'github:github.com:1', owner: 'alice', name: 'workspace' }
const commit = 'a'.repeat(40)
const tree = 'b'.repeat(40)
const blob = 'c'.repeat(40)
const detail: Data<'detail'> = {
  kind: 'detail',
  id: 'github:github.com:44',
  fullName: 'alice/workspace',
  description: null,
  defaultBranch: 'main',
  visibility: 'public',
  archived: false,
}
const branches: Data<'branches'> = {
  kind: 'branches',
  items: [{ name: 'main', commit: { sha: commit }, protected: false }],
  page: 1,
  hasNext: false,
}
const revision: Data<'branch'> = { kind: 'branch', name: 'main', commitSha: commit, treeSha: tree }
const entry: TreeEntry = { path: 'main.ts', sha: blob, mode: '100644', type: 'blob', size: 4 }
const directory: Data<'directory'> = {
  kind: 'directory',
  sha: tree,
  items: [entry],
  truncated: false,
}
function setup() {
  const bridge = vi
    .fn<ExplorerBridge>()
    .mockResolvedValueOnce(detail)
    .mockResolvedValueOnce(branches)
    .mockResolvedValueOnce(revision)
    .mockResolvedValueOnce(directory)
  return { bridge, model: createExplorer(bridge) }
}
describe('repository explorer state', () => {
  it('resolves the default branch before fetching its immutable directory object', async () => {
    const { bridge, model } = setup()
    await model.open(target)
    expect(bridge.mock.calls.map((call) => call[1])).toEqual([
      { kind: 'detail' },
      { kind: 'branches', page: 1 },
      { kind: 'branch', branch: 'main' },
      { kind: 'directory', sha: tree },
    ])
    expect(model.state.revision?.commitSha).toBe(commit)
    expect(model.state.directory?.items[0]?.path).toBe('main.ts')
    model.dispose()
  })
  it('ignores a late branch resolution after selecting another branch', async () => {
    const { bridge, model } = setup()
    await model.open(target)
    let finish!: (value: Data<'branch'>) => void
    bridge.mockReturnValueOnce(
      new Promise<Data<'branch'>>((resolve) => {
        finish = resolve
      }),
    )
    const pending = model.selectBranch('feature/slow')
    bridge.mockResolvedValueOnce(revision).mockResolvedValueOnce(directory)
    await model.selectBranch('main')
    finish({
      ...revision,
      name: 'feature/slow',
      commitSha: 'd'.repeat(40),
      treeSha: 'e'.repeat(40),
    })
    await pending
    expect(model.state.selectedBranch).toBe('main')
    expect(model.state.revision?.name).toBe('main')
    expect(bridge).toHaveBeenCalledTimes(7)
    model.dispose()
  })
  it('does not let a late repository response replace a new target', async () => {
    const { bridge, model } = setup()
    await model.open(target)
    let finish!: (value: Data<'detail'>) => void
    bridge.mockReturnValueOnce(
      new Promise<Data<'detail'>>((resolve) => {
        finish = resolve
      }),
    )
    const pending = model.open({ ...target, name: 'slow' })
    bridge
      .mockResolvedValueOnce({ ...detail, fullName: 'alice/latest' })
      .mockResolvedValueOnce({ ...branches, items: [] })
    await model.open({ ...target, name: 'latest' })
    finish(detail)
    await pending
    expect(model.state.target?.name).toBe('latest')
    expect(model.state.detail?.fullName).toBe('alice/latest')
    model.dispose()
  })
  it('keeps breadcrumbs retryable and prevents a previous file from replacing a directory', async () => {
    const { bridge, model } = setup()
    await model.open(target)
    let finish!: (value: Data<'file'>) => void
    bridge.mockReturnValueOnce(
      new Promise<Data<'file'>>((resolve) => {
        finish = resolve
      }),
    )
    const pending = model.selectEntry(entry)
    bridge.mockResolvedValueOnce({ ...directory, sha: 'd'.repeat(40), items: [] })
    await model.directory([...model.state.crumbs, { name: 'src', sha: 'd'.repeat(40) }])
    finish({ kind: 'file', sha: blob, size: 4, status: 'text', text: 'late' })
    await pending
    expect(model.state.entry).toBeNull()
    expect(model.state.preview).toBeNull()
    expect(model.state.crumbs.at(-1)?.name).toBe('src')
    model.dispose()
  })
  it('honors cooldowns, retains retry context, and never fetches special entry targets', async () => {
    const { bridge, model } = setup()
    await model.open(target)
    bridge.mockRejectedValueOnce({ code: 'rateLimited', retryAfterSeconds: 60 })
    await model.selectEntry(entry)
    const calls = bridge.mock.calls.length
    await model.retry()
    expect(bridge).toHaveBeenCalledTimes(calls)
    expect(model.remaining.value).toBeGreaterThan(0)
    await model.selectEntry({ ...entry, mode: '120000' })
    expect(model.state.special).toBe('symlink')
    await model.selectEntry({ ...entry, type: 'commit', mode: '160000' })
    expect(model.state.special).toBe('submodule')
    expect(bridge).toHaveBeenCalledTimes(calls)
    model.dispose()
  })
  it('shows empty repositories without trying to resolve a nonexistent default branch', async () => {
    const bridge = vi
      .fn<ExplorerBridge>()
      .mockResolvedValueOnce(detail)
      .mockResolvedValueOnce({ ...branches, items: [] })
    const model = createExplorer(bridge)
    await model.open(target)
    expect(model.state.empty).toBe(true)
    expect(bridge).toHaveBeenCalledTimes(2)
    model.dispose()
  })
})
