import { readonly, ref } from 'vue'

const sharedCaches = new Set<() => void>()
const revision = ref(0)
export const sessionCacheRevision = readonly(revision)

export function registerSessionCache(clear: () => void) {
  sharedCaches.add(clear)
}

export function clearSessionCaches() {
  for (const clear of sharedCaches) clear()
  revision.value++
}

export function sessionCache<T>(
  limit: number,
  freshFor: number,
  retainFor: number,
  shared = false,
) {
  const entries = new Map<string, { value: T; at: number }>()
  const pending = new Map<string, Promise<T>>()

  function peek(key: string) {
    const entry = entries.get(key)
    if (!entry) return
    entries.delete(key)
    if (Date.now() - entry.at >= retainFor) return
    entries.set(key, entry)
    return entry
  }

  function load(key: string, request: () => Promise<T>, force = false): Promise<T> {
    const entry = peek(key)
    if (!force && entry && Date.now() - entry.at < freshFor) return Promise.resolve(entry.value)
    const active = pending.get(key)
    if (active) return active
    const task = request()
      .then((value) => {
        if (pending.get(key) === task) {
          entries.delete(key)
          entries.set(key, { value, at: Date.now() })
          while (entries.size > limit) entries.delete(entries.keys().next().value!)
        }
        return value
      })
      .finally(() => {
        if (pending.get(key) === task) pending.delete(key)
      })
    pending.set(key, task)
    return task
  }

  function clear() {
    entries.clear()
    pending.clear()
  }

  if (shared) registerSessionCache(clear)
  return {
    peek,
    load,
    clear,
    fresh: (key: string) => Date.now() - (peek(key)?.at ?? -Infinity) < freshFor,
  }
}
