import { onScopeDispose, ref, shallowRef, watch } from 'vue'
import { accountError, type Account } from '../lib/accounts'
import {
  readCachedContributionSource,
  readContributionSource,
  type ContributionResponse,
} from '../lib/contributions'

export function useContributionSource(
  account: () => Account | undefined,
  day: () => string | null,
) {
  const response = shallowRef<ContributionResponse>()
  const cached = ref(false)
  const loading = ref(false)
  const error = ref('')
  let generation = 0
  let refreshAfter = 0

  function apply(
    result: ContributionResponse,
    selected: Account,
    date: string | null,
    fromCache: boolean,
  ) {
    const expected =
      selected.provider === 'gitee' ? 'giteePublicEvents' : date ? 'githubDay' : 'githubCalendar'
    if (
      result.accountId !== selected.id ||
      result.data.source !== expected ||
      !Number.isFinite(result.refreshedAt)
    ) {
      throw { code: 'invalidResponse' }
    }
    response.value = result
    cached.value = fromCache
  }

  watch(
    [() => account()?.id, () => account()?.verifiedAt, day],
    async () => {
      const revision = ++generation
      response.value = undefined
      cached.value = false
      loading.value = false
      error.value = ''
      refreshAfter = 0
      const selected = account()
      if (!selected) return
      const date = day()
      try {
        const result = await readCachedContributionSource(selected.id, date)
        if (result && generation === revision) apply(result, selected, date, true)
      } catch (cause) {
        if (generation === revision) error.value = accountError(cause).message
      }
    },
    { immediate: true, flush: 'sync' },
  )

  onScopeDispose(() => {
    generation++
  })

  async function refresh() {
    const selected = account()
    if (!selected || loading.value || Date.now() < refreshAfter) return
    const date = day()
    const revision = ++generation
    error.value = ''
    loading.value = true
    try {
      const result = await readContributionSource(selected.id, date)
      if (generation === revision) apply(result, selected, date, false)
    } catch (cause) {
      if (generation !== revision) return
      const failure = accountError(cause)
      refreshAfter = Date.now() + (failure.retryAfterSeconds ?? 0) * 1000
      error.value = failure.message
      cached.value = !!response.value
      if (!response.value) {
        try {
          const saved = await readCachedContributionSource(selected.id, date)
          if (saved && generation === revision) apply(saved, selected, date, true)
        } catch {
          return
        }
      }
    } finally {
      if (generation === revision) loading.value = false
    }
  }

  return { response, cached, loading, error, refresh }
}
