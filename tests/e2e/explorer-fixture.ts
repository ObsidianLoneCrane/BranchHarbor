import type { Page } from '@playwright/test'

// Explicit browser-only IPC fixture. No provider, disk, or OS credential access.
export async function installExplorerFixture(
  page: Page,
  options: {
    empty?: boolean
    slowBranch?: boolean
    fileError?: boolean
    rateLimit?: boolean
    missingBranch?: boolean
    truncated?: boolean
  } = {},
) {
  await page.addInitScript((options) => {
    const sha = (letter: string) => letter.repeat(40)
    let fileCalls = 0
    const accounts = [
      {
        id: 'github:github.com:1',
        provider: 'github',
        host: 'github.com',
        userId: '1',
        login: 'alice',
        name: 'Alice Sample',
        verifiedAt: 1,
        credentialStatus: 'saved',
      },
      {
        id: 'gitee:gitee.com:10',
        provider: 'gitee',
        host: 'gitee.com',
        userId: '10',
        login: 'jane',
        name: 'Jane Sample',
        verifiedAt: 1,
        credentialStatus: 'saved',
      },
    ]
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
          if (command === 'list_repositories') {
            const query = args.query as { accountId: string; page: number }
            const account = accounts.find((account) => account.id === query.accountId)!
            const name = query.page === 1 ? 'workspace' : 'second-project'
            return {
              accountId: query.accountId,
              page: query.page,
              hasNext: query.page === 1,
              accessNotice: 'Synthetic repositories only.',
              items: [
                {
                  id: `${account.provider}:${account.host}:44`,
                  name,
                  fullName: `${account.login}/${name}`,
                  description: 'Synthetic repository for explorer checks.',
                  visibility: 'private',
                  owner: account.login,
                  owned: true,
                  language: 'TypeScript',
                  defaultBranch: 'main',
                  updatedAt: '2026-11-02T00:00:00Z',
                  archived: false,
                },
              ],
            }
          }
          if (command !== 'explore_repository') throw new Error('Unsupported fixture command')
          const query = args.query as {
            accountId: string
            owner: string
            name: string
            kind: string
            page?: number
            branch?: string
            sha?: string
          }
          let data: Record<string, unknown>
          if (query.kind === 'detail')
            data = {
              kind: 'detail',
              id: 'fixture:44',
              fullName: `${query.owner}/${query.name}`,
              description: 'A synthetic project for read-only repository exploration.',
              visibility: 'private',
              defaultBranch: 'main',
              archived: false,
            }
          else if (query.kind === 'branches')
            data = {
              kind: 'branches',
              page: query.page,
              hasNext: query.page === 1 && !options.empty,
              items: options.empty
                ? []
                : (query.page === 1 ? ['main', 'feature/preview'] : ['release']).map((name) => ({
                    name,
                    commit: { sha: sha(name === 'main' ? 'a' : 'd') },
                    protected: name === 'main',
                  })),
            }
          else if (query.kind === 'branch') {
            if (options.missingBranch && query.branch === 'feature/preview')
              throw { code: 'resourceUnavailable' }
            if (options.slowBranch && query.branch === 'feature/preview')
              await new Promise((resolve) => setTimeout(resolve, 500))
            data = {
              kind: 'branch',
              name: query.branch,
              commitSha: sha(query.branch === 'main' ? 'a' : 'd'),
              treeSha: sha(query.branch === 'main' ? 'b' : 'e'),
            }
          } else if (query.kind === 'directory') {
            const entry = (
              path: string,
              letter: string,
              type = 'blob',
              mode = '100644',
              size = 80,
            ) => ({ path, sha: sha(letter), type, mode, size })
            data = {
              kind: 'directory',
              sha: query.sha,
              truncated: !!options.truncated,
              items:
                query.sha === sha('f')
                  ? [entry('main.ts', '9')]
                  : [
                      entry('src', 'f', 'tree', '040000'),
                      entry('README.md', query.sha === sha('e') ? 'd' : 'c'),
                      entry('unsafe.html', '7'),
                      entry('logo.png', '1'),
                      entry('large.dat', '2', 'blob', '100644', 999999),
                      entry('legacy.txt', '3'),
                      entry('link', '4', 'blob', '120000'),
                      entry('vendor', '6', 'commit', '160000'),
                      entry('empty.txt', '8'),
                    ],
            }
          } else if (query.kind === 'file') {
            fileCalls++
            if (fileCalls === 1 && options.fileError)
              throw {
                code: 'resourceUnavailable',
                message: 'Sensitive response must not be echoed.',
              }
            if (fileCalls === 1 && options.rateLimit)
              throw { code: 'rateLimited', retryAfterSeconds: 2 }
            const status =
              query.sha === sha('1')
                ? 'binary'
                : query.sha === sha('2')
                  ? 'tooLarge'
                  : query.sha === sha('3')
                    ? 'unsupportedEncoding'
                    : 'text'
            const text =
              query.sha === sha('9')
                ? 'export const message = "Hello, BranchHarbor"\nexport const answer = 42\n'
                : query.sha === sha('7')
                  ? '<img src="invalid" onerror="window.previewExecuted=true"><script>window.previewExecuted=true</script>'
                  : query.sha === sha('8')
                    ? ''
                    : query.sha === sha('d')
                      ? '# Feature preview\nThis is another branch.\n'
                      : '# Workspace\nSource from the pinned main commit.\n'
            data = {
              kind: 'file',
              sha: query.sha,
              size: text.length,
              status,
              text: status === 'text' ? text : null,
            }
          } else throw { code: 'invalidRepositoryInput' }
          return { accountId: query.accountId, owner: query.owner, name: query.name, data }
        },
      },
    })
  }, options)
}
