import { computed, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import {
  accountError,
  type Provider,
  type RepositoryPage,
  type RepositoryQuery,
} from '../lib/accounts'
import {
  hasLocalGit,
  listLocal,
  localGitError,
  localRepositoryName,
  type LocalRepository,
} from '../lib/localGit'
import { sessionCache, sessionCacheRevision } from '../lib/sessionCache'
import { loadRepositoryPage, repositoryPageKey, repositoryPages } from '../lib/repositoryPages'
import { useAccounts } from './accounts'
import { useForegroundRefresh } from './foregroundRefresh'

const localCatalog = sessionCache<{ items: LocalRepository[]; links: [number, string[]][] }>(
  1,
  15_000,
  60_000,
  true,
)

export const invalidateLocalCatalog = localCatalog.clear
type RemoteRepository = {
  id: string
  accountId: string
  owner: string
  name: string
  provider: Provider
}

export interface WorkspaceRepository {
  key: string
  name: string
  local?: LocalRepository
  remotes: RemoteRepository[]
  updatedAt?: string | null
  sources: ('local' | Provider)[]
}

const visits = ref<Record<string, { count: number; at: number }>>(loadVisits())
function loadVisits() {
  try {
    return JSON.parse(localStorage.getItem('branchharbor.repositoryVisits') ?? '{}') as Record<
      string,
      { count: number; at: number }
    >
  } catch {
    return {}
  }
}

export function recordRepositoryVisit(key: string) {
  visits.value[key] = { at: Date.now(), count: (visits.value[key]?.count ?? 0) + 1 }
  const recent = Object.entries(visits.value)
    .sort((left, right) => right[1].at - left[1].at)
    .slice(0, 100)
  visits.value = Object.fromEntries(recent)
  try {
    localStorage.setItem('branchharbor.repositoryVisits', JSON.stringify(visits.value))
  } catch {
    return
  }
}

export function useWorkspaceRepositories() {
  const store = useAccounts()
  const locals = ref(localCatalog.peek('local')?.value.items ?? [])
  const links = ref(localCatalog.peek('local')?.value.links ?? [])
  const entries = ref<Record<string, RepositoryPage[]>>({})
  const failures = ref<Record<string, string>>({})
  const localError = ref('')
  const busy = ref(false)
  let generation = 0
  let localGeneration = 0
  const eligible = computed(() =>
    store.accounts.value.filter((account) => account.credentialStatus === 'saved'),
  )
  const query = (accountId: string, page: number): RepositoryQuery => ({
    accountId,
    page,
    ownership: 'all',
    visibility: 'all',
  })

  async function local(force = false) {
    if (!hasLocalGit()) return
    const ticket = ++localGeneration
    try {
      const result = await localCatalog.load(
        'local',
        async () => {
          const [items, urls] = await Promise.all([
            listLocal(),
            invoke<[number, string[]][]>('list_repository_links').catch(() => []),
          ])
          return { items, links: urls }
        },
        force,
      )
      if (ticket !== localGeneration) return
      locals.value = result.items
      links.value = result.links
      localError.value = ''
    } catch (error) {
      if (ticket === localGeneration) localError.value = localGitError(error)
    }
  }

  async function load(force = false, more = false, preserve = false) {
    const ticket = ++generation
    const accounts = eligible.value
    if (!more && !preserve) {
      entries.value = Object.fromEntries(
        accounts.flatMap((account) => {
          const value = repositoryPages.peek(repositoryPageKey(query(account.id, 1)))?.value
          return value ? [[account.id, [value]]] : []
        }),
      )
    }
    failures.value = {}
    busy.value = true
    await Promise.all(
      accounts.map(async (account) => {
        const previous = entries.value[account.id] ?? []
        if (more && previous.length && !previous.at(-1)?.hasNext) return
        const page = more ? (previous.at(-1)?.page ?? 0) + 1 : 1
        if (page > 10) return
        try {
          const result = await loadRepositoryPage(query(account.id, page), force)
          if (generation === ticket) {
            entries.value[account.id] = more
              ? [...previous, result]
              : [result, ...(preserve && result.hasNext ? previous.slice(1) : [])]
          }
        } catch (error) {
          if (generation === ticket) failures.value[account.id] = accountError(error).message
        }
      }),
    )
    if (generation === ticket) busy.value = false
  }

  onMounted(() => {
    void local()
    void store.ensureLoaded()
  })
  const active = useForegroundRefresh(() => {
    if (!localCatalog.fresh('local')) void local()
    if (
      !busy.value &&
      eligible.value.some(
        (account) =>
          !entries.value[account.id] ||
          !repositoryPages.fresh(repositoryPageKey(query(account.id, 1))),
      )
    )
      void load(false, false, true)
  })
  watch(
    () => JSON.stringify([sessionCacheRevision.value, eligible.value.map(({ id }) => id)]),
    () => {
      generation++
      entries.value = {}
      locals.value = localCatalog.peek('local')?.value.items ?? []
      links.value = localCatalog.peek('local')?.value.links ?? []
      busy.value = false
      if (active()) {
        void local()
        void load()
      }
    },
    { immediate: true },
  )
  const items = computed(() => {
    const localItems: WorkspaceRepository[] = locals.value.map((local) => ({
      key: `local:${local.id}`,
      name: localRepositoryName(local.path),
      local,
      remotes: [],
      sources: ['local'],
    }))
    const byId = new Map(localItems.map((item) => [item.local!.id, item]))
    const paths = new Map<string, WorkspaceRepository[]>()
    for (const [id, pathsForRepository] of links.value) {
      const item = byId.get(id)
      if (!item) continue
      for (const path of pathsForRepository) {
        const matches = paths.get(path) ?? []
        if (!matches.includes(item)) matches.push(item)
        paths.set(path, matches)
      }
    }
    const remoteItems = new Map<string, WorkspaceRepository>()
    for (const account of eligible.value) {
      for (const entry of entries.value[account.id] ?? []) {
        for (const repository of entry.items) {
          const key = `${account.provider}:${repository.id}`
          if (remoteItems.has(key)) continue
          const remote = {
            id: repository.id,
            accountId: account.id,
            owner: repository.owner,
            name: repository.name,
            provider: account.provider,
          }
          const item: WorkspaceRepository = {
            key,
            name: repository.fullName,
            remotes: [remote],
            sources: [account.provider],
            updatedAt: repository.updatedAt,
          }
          remoteItems.set(key, item)
          const matches =
            paths.get(`${account.provider}.com/${repository.fullName.toLowerCase()}`) ?? []
          if (matches.length === 1) {
            const [match] = matches
            const count = match!.remotes.push(remote)
            if (!match!.sources.includes(account.provider)) match!.sources.push(account.provider)
            if (count === 1) match!.name = repository.fullName
            if ((repository.updatedAt ?? '') > (match!.updatedAt ?? ''))
              match!.updatedAt = repository.updatedAt
            item.local = match!.local
          }
        }
      }
    }
    return [...localItems, ...[...remoteItems.values()].filter((item) => !item.local)]
  })
  const popular = computed(() =>
    [...items.value].sort((left, right) => {
      const score = (item: WorkspaceRepository) => {
        const local = item.local && visits.value[`local:${item.local.id}`]
        const remote = item.remotes.map(
          (repository) => visits.value[`remote:${repository.provider}:${repository.id}`],
        )
        return Math.max(
          0,
          ...[local, ...remote].map((visit) => (visit ? visit.at + visit.count * 3_600_000 : 0)),
        )
      }
      return (
        score(right) - score(left) || (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '')
      )
    }),
  )
  return {
    items,
    popular,
    busy,
    failures,
    localError,
    accounts: store.accounts,
    hasMore: computed(() =>
      eligible.value.some(({ id }) => {
        const last = entries.value[id]?.at(-1)
        return last ? last.hasNext && last.page < 10 : !!failures.value[id]
      }),
    ),
    refresh: () => Promise.all([local(true), load(true)]),
    refreshLocal: () => local(true),
    more: () => load(false, true),
  }
}
