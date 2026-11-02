import { afterEach, describe, expect, it, vi } from 'vitest'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { read, stateLabel } from './reader'
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: vi.fn() }))
afterEach(() => vi.resetAllMocks())
const target = { accountId: 'gitee:gitee.com:1', owner: 'alice', name: 'workspace' }
describe('collaboration native boundary', () => {
  it('rejects browser requests without inventing discussion data', async () => {
    vi.mocked(isTauri).mockReturnValue(false)
    await expect(
      read(target, 'issues', { kind: 'list', page: 1, state: 'open' }),
    ).rejects.toMatchObject({ code: 'browserUnavailable' })
    expect(invoke).not.toHaveBeenCalled()
  })
  it('preserves Gitee issue identifiers and explicit repository/resource scope', async () => {
    vi.mocked(isTauri).mockReturnValue(true)
    const data = { kind: 'comments', number: 'IKS135', items: [], page: 2, hasNext: false }
    vi.mocked(invoke).mockResolvedValue({ ...target, resource: 'issues', data })
    expect(await read(target, 'issues', { kind: 'comments', number: 'IKS135', page: 2 })).toEqual(
      data,
    )
    expect(invoke).toHaveBeenCalledWith('read_collaboration', {
      query: { ...target, resource: 'issues', kind: 'comments', number: 'IKS135', page: 2 },
    })
  })
  it('rejects responses for another account, repository, resource, number, page, or operation', async () => {
    vi.mocked(isTauri).mockReturnValue(true)
    for (const override of [
      { accountId: 'github:github.com:1' },
      { owner: 'bob' },
      { name: 'elsewhere' },
      { resource: 'pulls' },
      { data: { kind: 'comments', number: 'OTHER', page: 1 } },
      { data: { kind: 'comments', number: 'IKS135', page: 2 } },
      { data: { kind: 'list', page: 1 } },
    ]) {
      vi.mocked(invoke).mockResolvedValue({
        ...target,
        resource: 'issues',
        data: { kind: 'comments', number: 'IKS135', page: 1 },
        ...override,
      })
      await expect(
        read(target, 'issues', { kind: 'comments', number: 'IKS135', page: 1 }),
      ).rejects.toMatchObject({ code: 'invalidResponse' })
    }
    vi.mocked(invoke).mockResolvedValue({
      ...target,
      resource: 'issues',
      data: { kind: 'detail', item: { number: 'WRONG' } },
    })
    await expect(
      read(target, 'issues', { kind: 'detail', number: 'IKS135' }),
    ).rejects.toMatchObject({ code: 'invalidResponse' })
  })
  it('labels supported and unknown states without prototype lookups', () => {
    expect(stateLabel('merged')).toBe('Merged')
    expect(stateLabel('progressing')).toBe('In progress')
    expect(stateLabel('constructor')).toBe('Unknown')
  })
})
