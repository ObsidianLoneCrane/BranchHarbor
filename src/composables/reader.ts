import { computed, reactive } from 'vue'
import { AccountError, accountError } from '../lib/accounts'
import {
  read,
  type ReaderData,
  type ReaderFilter,
  type ReaderOperation,
  type ReaderResult,
  type Resource,
} from '../lib/reader'
import type { RepositoryTarget } from '../lib/explorer'
import { registerSessionCache, sessionCache } from '../lib/sessionCache'

const discussionCache = sessionCache<ReaderData>(32, 60_000, 10 * 60_000, true)
let preparedList: { key: string; request: Promise<ReaderData> } | undefined
registerSessionCache(() => {
  preparedList = undefined
})

function discussionKey(target: RepositoryTarget, resource: Resource, operation: ReaderOperation) {
  return JSON.stringify([target.accountId, target.owner, target.name, resource, operation])
}

export function prepareDiscussionList(target: RepositoryTarget, resource: Resource) {
  const operation = { kind: 'list', page: 1, state: 'open' } as const
  const key = discussionKey(target, resource, operation)
  if (discussionCache.fresh(key)) return
  const request = discussionCache.load(key, () => read(target, resource, operation))
  preparedList = { key, request }
  void request.catch(() => {})
}

export interface ReaderContext {
  target: RepositoryTarget
  resource: Resource
  filter: ReaderFilter
  page: number
  number: string
  commentPage: number
}
export type ReaderBridge = (
  target: RepositoryTarget,
  resource: Resource,
  operation: ReaderOperation,
) => Promise<ReaderData>
export function createReader(bridge: ReaderBridge = read) {
  const state = reactive({
    context: null as ReaderContext | null,
    list: null as ReaderResult<'list'> | null,
    detail: null as ReaderResult<'detail'> | null,
    comments: null as ReaderResult<'comments'> | null,
    busy: '',
    error: null as AccountError | null,
    errorFor: '',
    now: Date.now(),
    cachedAt: 0,
  })
  let generation = 0
  let listKey = ''
  let detailKey = ''
  let timer: ReturnType<typeof setInterval> | undefined
  const cooldowns = reactive(new Map<string, number>())
  const cache =
    bridge === read ? discussionCache : sessionCache<ReaderData>(32, 60_000, 10 * 60_000)
  const remaining = computed(() =>
    Math.max(
      0,
      Math.ceil(((cooldowns.get(state.context?.target.accountId ?? '') ?? 0) - state.now) / 1000),
    ),
  )
  async function request<K extends ReaderOperation['kind']>(
    context: ReaderContext,
    operation: Extract<ReaderOperation, { kind: K }>,
    force: boolean,
  ) {
    const cacheKey = key(context, operation)
    const prepared =
      cache === discussionCache && !force && preparedList?.key === cacheKey
        ? preparedList
        : undefined
    if (prepared) preparedList = undefined
    const response = await (prepared?.request ??
      cache.load(
        cacheKey,
        () => {
          const seconds = Math.ceil(
            ((cooldowns.get(context.target.accountId) ?? 0) - Date.now()) / 1000,
          )
          if (seconds > 0) return Promise.reject(new AccountError('rateLimited', seconds))
          return bridge(context.target, context.resource, operation).then((response) => {
            if (!response || response.kind !== operation.kind)
              throw new AccountError('invalidResponse')
            return response
          })
        },
        force,
      ))
    if (!response || response.kind !== operation.kind) throw new AccountError('invalidResponse')
    return response as ReaderResult<K>
  }
  function key(context: ReaderContext, operation: ReaderOperation) {
    return discussionKey(context.target, context.resource, operation)
  }
  async function open(context: ReaderContext, refresh = false) {
    const current = { ...context, target: { ...context.target } }
    const repositoryKey = JSON.stringify([
      current.target.accountId,
      current.target.owner,
      current.target.name,
      current.resource,
    ])
    const nextListKey = JSON.stringify([repositoryKey, current.filter, current.page])
    const nextDetailKey = JSON.stringify([repositoryKey, current.number])
    if (listKey !== nextListKey) {
      state.list = null
      listKey = nextListKey
    }
    if (detailKey !== nextDetailKey || !current.number) {
      state.detail = null
      state.comments = null
      detailKey = nextDetailKey
    }
    if (state.comments?.page !== current.commentPage) state.comments = null
    state.context = current
    const ticket = ++generation
    state.error = null
    state.errorFor = ''
    state.busy = ''
    state.cachedAt = 0
    try {
      if (!current.number) {
        const operation = { kind: 'list', page: current.page, state: current.filter } as const
        const saved = cache.peek(key(current, operation))
        if (saved?.value.kind === 'list') {
          state.list = saved.value
          state.cachedAt = saved.at
        } else state.list = null
        state.busy = 'list'
        const result = await request(current, operation, refresh)
        if (ticket === generation) {
          state.list = result
          state.cachedAt = cache.peek(key(current, operation))?.at ?? 0
        }
      } else {
        const detail = { kind: 'detail', number: current.number } as const
        const comments = {
          kind: 'comments',
          number: current.number,
          page: current.commentPage,
        } as const
        const savedDetail = cache.peek(key(current, detail))
        const savedComments = cache.peek(key(current, comments))
        if (savedDetail?.value.kind === 'detail') {
          state.detail = savedDetail.value
          state.cachedAt = savedDetail.at
        } else state.detail = null
        state.comments = savedComments?.value.kind === 'comments' ? savedComments.value : null
        const loadingDetail = request(current, detail, refresh)
        const loadingComments = request(current, comments, refresh).then(
          (result) => ({ result }),
          (error: unknown) => ({ error }),
        )
        state.busy = 'detail'
        const detailResult = await loadingDetail
        if (ticket !== generation) return
        state.detail = detailResult
        state.cachedAt = cache.peek(key(current, detail))?.at ?? 0
        state.busy = 'comments'
        const outcome = await loadingComments
        if ('error' in outcome) throw outcome.error
        if (ticket === generation) state.comments = outcome.result
      }
    } catch (cause) {
      if (ticket !== generation) return
      state.error = accountError(cause)
      state.errorFor = state.busy
      if (state.error.code === 'rateLimited') {
        cooldowns.set(
          current.target.accountId,
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
  return {
    state,
    remaining,
    open,
    retry: async () => {
      if (state.context) await open(state.context)
    },
    refresh: async () => {
      if (state.context) await open(state.context, true)
    },
    reset: () => {
      generation++
      state.list = state.detail = state.comments = null
      state.context = null
      state.error = null
      state.busy = ''
      state.cachedAt = 0
    },
    dispose: () => {
      generation++
      clearInterval(timer)
    },
  }
}
