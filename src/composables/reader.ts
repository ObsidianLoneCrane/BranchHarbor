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
  })
  let generation = 0
  let listKey = ''
  let detailKey = ''
  let timer: ReturnType<typeof setInterval> | undefined
  const cooldowns = reactive(new Map<string, number>())
  const remaining = computed(() =>
    Math.max(
      0,
      Math.ceil(((cooldowns.get(state.context?.target.accountId ?? '') ?? 0) - state.now) / 1000),
    ),
  )
  async function request<K extends ReaderOperation['kind']>(
    context: ReaderContext,
    operation: Extract<ReaderOperation, { kind: K }>,
  ) {
    const seconds = Math.ceil(((cooldowns.get(context.target.accountId) ?? 0) - Date.now()) / 1000)
    if (seconds > 0) throw new AccountError('rateLimited', seconds)
    const response = await bridge(context.target, context.resource, operation)
    if (!response || response.kind !== operation.kind) throw new AccountError('invalidResponse')
    return response as ReaderResult<K>
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
    if (refresh) {
      if (current.number) {
        state.detail = null
        state.comments = null
      } else state.list = null
    }
    if (state.comments?.page !== current.commentPage) state.comments = null
    state.context = current
    const ticket = ++generation
    state.error = null
    state.errorFor = ''
    state.busy = ''
    try {
      if (!current.number) {
        if (state.list) return
        state.busy = 'list'
        const result = await request(current, {
          kind: 'list',
          page: current.page,
          state: current.filter,
        })
        if (ticket === generation) state.list = result
      } else {
        if (!state.detail) {
          state.busy = 'detail'
          const result = await request(current, { kind: 'detail', number: current.number })
          if (ticket !== generation) return
          state.detail = result
        }
        if (state.comments) return
        state.busy = 'comments'
        const result = await request(current, {
          kind: 'comments',
          number: current.number,
          page: current.commentPage,
        })
        if (ticket === generation) state.comments = result
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
    dispose: () => {
      generation++
      clearInterval(timer)
    },
  }
}
