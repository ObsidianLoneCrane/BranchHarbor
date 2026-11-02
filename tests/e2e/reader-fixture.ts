import type { Page } from '@playwright/test'
import { installExplorerFixture } from './explorer-fixture'

export async function installReaderFixture(
  page: Page,
  options: {
    slowDetail?: boolean
    slowList?: boolean
    commentsError?: boolean
    rateLimit?: boolean
    filteredPage?: boolean
    missing?: boolean
    empty?: boolean
    unsafe?: boolean
    truncated?: boolean
  } = {},
) {
  await installExplorerFixture(page)
  await page.addInitScript((options) => {
    type Query = {
      accountId: string
      owner: string
      name: string
      resource: string
      kind: string
      number?: string
      state?: string
      page?: number
    }
    const scope = window as unknown as {
      __readerFixture: (query: Query) => Promise<unknown>
      __readerCalls: Query[]
    }
    scope.__readerCalls = []
    let commentsCalls = 0
    scope.__readerFixture = async (query) => {
      scope.__readerCalls.push({ ...query })
      const gitee = query.accountId.startsWith('gitee:')
      const pull = query.resource === 'pulls'
      const makeItem = (
        number: string,
        state: string,
        title = pull
          ? number === '44'
            ? 'Keep directory requests pinned to a commit'
            : number === '43'
              ? 'Clarify empty repository behavior'
              : 'Improve branch browsing'
          : 'Handle an empty repository',
      ) => ({
        number,
        title,
        state,
        author: query.owner,
        labels: ['desktop', 'enhancement'],
        createdAt: '2026-11-02T10:00:00Z',
        updatedAt: '2026-11-02T11:30:00Z',
        draft: pull && state === 'open',
      })
      const issueNumber = (state: string) =>
        !gitee
          ? state === 'closed'
            ? '8'
            : '7'
          : state === 'progressing'
            ? 'IKS135'
            : state === 'closed'
              ? 'ICLOSED1'
              : state === 'rejected'
                ? 'IREJECT1'
                : 'IOPEN1'
      let data: Record<string, unknown>
      if (query.kind === 'list') {
        if (options.slowList && pull) await new Promise((resolve) => setTimeout(resolve, 500))
        let state = query.state === 'all' ? 'open' : (query.state ?? 'open')
        let number = pull
          ? state === 'merged'
            ? '44'
            : state === 'closed'
              ? '43'
              : '42'
          : issueNumber(state)
        if (query.page === 2) {
          number = pull ? '45' : gitee ? 'INEXT2' : '9'
          state = query.state === 'all' ? 'closed' : state
        }
        const items =
          options.empty || (options.filteredPage && query.page === 1)
            ? []
            : [makeItem(number, state, query.page === 2 ? 'Second provider page' : undefined)]
        if (
          pull &&
          query.state === 'all' &&
          query.page === 1 &&
          !options.empty &&
          !options.filteredPage
        ) {
          items.splice(
            0,
            items.length,
            makeItem('42', 'open', 'Improve branch browsing'),
            makeItem('43', 'closed', 'Clarify empty repository behavior'),
            makeItem('44', 'merged', 'Keep directory requests pinned to a commit'),
          )
        }
        data = {
          kind: 'list',
          items,
          page: query.page,
          hasNext: !options.empty && query.page === 1,
          filtered: !!options.filteredPage && query.page === 1,
        }
      } else if (query.kind === 'detail') {
        if (options.missing)
          throw { code: 'resourceUnavailable', message: 'Do not echo provider secrets.' }
        if (options.slowDetail && query.number === '42')
          await new Promise((resolve) => setTimeout(resolve, 500))
        const state =
          query.number === '44'
            ? 'merged'
            : ['43', '45', '8', 'ICLOSED1'].includes(query.number ?? '')
              ? 'closed'
              : query.number === 'IKS135'
                ? 'progressing'
                : query.number === 'IREJECT1'
                  ? 'rejected'
                  : 'open'
        const body = options.unsafe
          ? '<img src="https://untrusted.invalid/image.png" onerror="window.readerExecuted=true"><script>window.readerExecuted=true</script>\n![external](https://untrusted.invalid/tracker.png)'
          : '## Context\nKeep repository browsing focused and predictable.\n\nThis discussion uses synthetic data for interface checks.'
        data = {
          kind: 'detail',
          item: makeItem(
            query.number!,
            state,
            query.number === '45' ? 'Second provider page' : undefined,
          ),
          body,
          bodyTruncated: !!options.truncated,
          head: pull ? { name: 'feature/explorer', repository: 'contributor/workspace' } : null,
          base: pull ? { name: 'develop', repository: `${query.owner}/${query.name}` } : null,
          mergedAt: state === 'merged' ? '2026-11-02T11:30:00Z' : null,
          closedAt: ['closed', 'merged'].includes(state) ? '2026-11-02T11:30:00Z' : null,
        }
      } else if (query.kind === 'comments') {
        commentsCalls++
        if (commentsCalls === 1 && options.commentsError) throw { code: 'network' }
        if (commentsCalls === 1 && options.rateLimit)
          throw { code: 'rateLimited', retryAfterSeconds: 2 }
        data = {
          kind: 'comments',
          number: query.number,
          page: query.page,
          hasNext: !options.empty && query.page === 1,
          items: options.empty
            ? []
            : [
                {
                  id: String(query.page === 1 ? '100' : '101'),
                  author: query.page === 1 ? 'reviewer' : null,
                  body: options.unsafe
                    ? '<script>window.readerExecuted=true</script>'
                    : query.page === 1
                      ? 'Please keep this case covered by a regression test.'
                      : 'Follow-up from page two.',
                  bodyTruncated: !!options.truncated,
                  createdAt: '2026-11-02T12:00:00Z',
                  updatedAt: '2026-11-02T12:30:00Z',
                },
              ],
        }
      } else throw { code: 'invalidReaderInput' }
      return {
        accountId: query.accountId,
        owner: query.owner,
        name: query.name,
        resource: query.resource,
        data,
      }
    }
  }, options)
}
