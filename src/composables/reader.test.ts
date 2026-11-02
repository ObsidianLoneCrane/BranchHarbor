import { describe, expect, it, vi } from 'vitest'
import { createReader, type ReaderBridge, type ReaderContext } from './reader'
import type { ReaderResult } from '../lib/reader'
const context: ReaderContext = {
  target: { accountId: 'github:github.com:1', owner: 'alice', name: 'workspace' },
  resource: 'pulls',
  filter: 'closed',
  page: 2,
  number: '',
  commentPage: 1,
}
const item = {
  number: '42',
  title: 'A useful change',
  state: 'closed',
  author: 'alice',
  labels: [],
  draft: false,
  createdAt: null,
  updatedAt: null,
}
const list: ReaderResult<'list'> = {
  kind: 'list',
  items: [item],
  page: 2,
  hasNext: false,
  filtered: false,
}
const detail: ReaderResult<'detail'> = {
  kind: 'detail',
  item,
  body: 'Description',
  bodyTruncated: false,
  head: null,
  base: null,
  mergedAt: null,
  closedAt: null,
}
const comments: ReaderResult<'comments'> = {
  kind: 'comments',
  number: '42',
  items: [],
  page: 1,
  hasNext: false,
}
describe('discussion reader state', () => {
  it('restores list state after reading details without fetching the list again', async () => {
    const bridge = vi
      .fn<ReaderBridge>()
      .mockResolvedValueOnce(list)
      .mockResolvedValueOnce(detail)
      .mockResolvedValueOnce(comments)
    const model = createReader(bridge)
    await model.open(context)
    await model.open({ ...context, number: '42' })
    await model.open(context)
    expect(model.state.list?.page).toBe(2)
    expect(model.state.detail).toBeNull()
    expect(bridge).toHaveBeenCalledTimes(3)
    model.dispose()
  })
  it('ignores stale list data when changing resource or account', async () => {
    let finish!: (result: ReaderResult<'list'>) => void
    const bridge = vi
      .fn<ReaderBridge>()
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve
        }),
      )
      .mockResolvedValueOnce({ ...list, items: [] })
    const model = createReader(bridge)
    const pending = model.open(context)
    await model.open({
      ...context,
      resource: 'issues',
      target: { ...context.target, accountId: 'gitee:gitee.com:1' },
    })
    finish(list)
    await pending
    expect(model.state.context?.resource).toBe('issues')
    expect(model.state.list?.items).toEqual([])
    model.dispose()
  })
  it('does not fetch old comments after a stale detail response arrives', async () => {
    let finish!: (result: ReaderResult<'detail'>) => void
    const bridge = vi
      .fn<ReaderBridge>()
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve
        }),
      )
      .mockResolvedValueOnce({ ...detail, item: { ...item, number: '43' } })
      .mockResolvedValueOnce({ ...comments, number: '43' })
    const model = createReader(bridge)
    const pending = model.open({ ...context, number: '42' })
    await model.open({ ...context, number: '43' })
    finish(detail)
    await pending
    expect(model.state.detail?.item.number).toBe('43')
    expect(bridge).toHaveBeenCalledTimes(3)
    model.dispose()
  })
  it('keeps a readable detail when comments fail and retries only the failed comments', async () => {
    const bridge = vi
      .fn<ReaderBridge>()
      .mockResolvedValueOnce(detail)
      .mockRejectedValueOnce({ code: 'network' })
      .mockResolvedValueOnce(comments)
    const model = createReader(bridge)
    await model.open({ ...context, number: '42' })
    expect(model.state.detail?.body).toBe('Description')
    expect(model.state.errorFor).toBe('comments')
    await model.retry()
    expect(model.state.error).toBeNull()
    expect(bridge.mock.calls[2]?.[2]).toEqual({ kind: 'comments', number: '42', page: 1 })
    model.dispose()
  })
  it('discards old comments when paging while preserving the selected detail', async () => {
    let finish!: (result: ReaderResult<'comments'>) => void
    const bridge = vi
      .fn<ReaderBridge>()
      .mockResolvedValueOnce(detail)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve
        }),
      )
      .mockResolvedValueOnce({ ...comments, page: 2 })
    const model = createReader(bridge)
    const pending = model.open({ ...context, number: '42' })
    await vi.waitFor(() => expect(bridge).toHaveBeenCalledTimes(2))
    await model.open({ ...context, number: '42', commentPage: 2 })
    finish(comments)
    await pending
    expect(model.state.comments?.page).toBe(2)
    expect(model.state.detail?.item.number).toBe('42')
    model.dispose()
  })
  it('blocks early retries during a per-account cooldown and clears stale data on target changes', async () => {
    vi.useFakeTimers()
    const bridge = vi
      .fn<ReaderBridge>()
      .mockRejectedValueOnce({ code: 'rateLimited', retryAfterSeconds: 60 })
      .mockResolvedValueOnce({ ...list, items: [] })
    const model = createReader(bridge)
    try {
      await model.open(context)
      await model.retry()
      expect(bridge).toHaveBeenCalledTimes(1)
      expect(model.remaining.value).toBeGreaterThan(0)
      await model.open({
        ...context,
        target: { ...context.target, accountId: 'gitee:gitee.com:2' },
      })
      expect(model.state.list?.items).toEqual([])
      await model.open(context)
      expect(model.state.list).toBeNull()
      expect(model.state.error?.code).toBe('rateLimited')
      expect(bridge).toHaveBeenCalledTimes(2)
    } finally {
      model.dispose()
      vi.useRealTimers()
    }
  })
})
