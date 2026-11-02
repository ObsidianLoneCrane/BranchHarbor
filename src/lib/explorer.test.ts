import { afterEach, describe, expect, it, vi } from 'vitest'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { explore } from './explorer'
import { highlightSource } from './syntax'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: vi.fn() }))
afterEach(() => vi.resetAllMocks())
const target = { accountId: 'github:github.com:1', owner: 'alice', name: 'workspace' }
describe('repository explorer boundary', () => {
  it('rejects browser calls and scopes every native request to an account and repository', async () => {
    vi.mocked(isTauri).mockReturnValue(false)
    await expect(explore(target, { kind: 'detail' })).rejects.toMatchObject({
      code: 'browserUnavailable',
    })
    expect(invoke).not.toHaveBeenCalled()
    vi.mocked(isTauri).mockReturnValue(true)
    const data = { kind: 'directory', sha: 'b'.repeat(40), items: [], truncated: false }
    vi.mocked(invoke).mockResolvedValue({ ...target, data })
    expect(await explore(target, { kind: 'directory', sha: 'b'.repeat(40) })).toEqual(data)
    expect(invoke).toHaveBeenCalledWith('explore_repository', {
      query: { ...target, kind: 'directory', sha: 'b'.repeat(40) },
    })
  })
  it('rejects a response for another account, repository, or operation', async () => {
    vi.mocked(isTauri).mockReturnValue(true)
    for (const override of [
      { accountId: 'gitee:gitee.com:1' },
      { owner: 'bob' },
      { name: 'another' },
      { data: { kind: 'file' } },
    ]) {
      vi.mocked(invoke).mockResolvedValue({ ...target, data: { kind: 'detail' }, ...override })
      await expect(explore(target, { kind: 'detail' })).rejects.toMatchObject({
        code: 'invalidResponse',
      })
    }
  })
  it('escapes HTML source and leaves unsupported languages as plain text', () => {
    const source = '<img src=x onerror="alert(1)"><script>alert(2)</script>'
    const result = highlightSource('unsafe.html', source)
    expect(result.language).toBe('xml')
    expect(result.html).not.toContain('<img')
    expect(result.html).not.toContain('<script>')
    expect(result.html).toContain('&lt;')
    expect(highlightSource('README.md', source)).toEqual({ language: null, html: null })
    expect(highlightSource('constructor', source).html).toBeNull()
    expect(highlightSource('main.ts', 'export const answer = 42').html).toContain('hljs-keyword')
  })
})
