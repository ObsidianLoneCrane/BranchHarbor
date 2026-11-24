import { createRouter, createWebHashHistory, type RouterHistory } from 'vue-router'
import { useAccounts } from './composables/accounts'
import { prepareDiscussionList } from './composables/reader'

export function createAppRouter(history: RouterHistory = createWebHashHistory()) {
  const desktopScrollPositions = new Map<number, { path: string; top: number }>()
  let activePosition: number | undefined
  const desktopScrollArea = () =>
    document.querySelector<HTMLElement>('.app-frame-desktop > .workspace-scroll')

  const router = createRouter({
    history,
    routes: [
      {
        path: '/',
        name: 'home',
        component: () => import('./views/HomeView.vue'),
        meta: { title: 'Home' },
      },
      {
        path: '/repositories',
        name: 'repositories',
        component: () => import('./views/RepositoriesView.vue'),
        meta: { title: 'Repositories' },
      },
      {
        path: '/repositories/local/:id(\\d+)',
        name: 'local-repository',
        component: () => import('./views/LocalRepositoryView.vue'),
        meta: { title: 'Local repository' },
      },
      {
        path: '/repositories/:accountId/:owner/:name',
        name: 'repository-explorer',
        component: () => import('./views/RepositoryExplorerView.vue'),
        meta: { title: 'Repository' },
      },
      {
        path: '/repositories/:accountId/:owner/:name/:references(branches|tags)',
        name: 'repository-references',
        component: () => import('./views/RepositoryReferencesView.vue'),
        meta: { title: 'Repository references' },
      },
      {
        path: '/repositories/:accountId/:owner/:name/:resource(pulls|issues)/:number?',
        name: 'repository-reader',
        component: () => import('./views/RepositoryReaderView.vue'),
        meta: { title: 'Repository discussion' },
      },
      {
        path: '/activity',
        name: 'activity',
        component: () => import('./views/ActivityView.vue'),
        meta: { title: 'Activity' },
      },
      {
        path: '/settings',
        name: 'settings',
        component: () => import('./views/SettingsView.vue'),
        meta: { title: 'Settings' },
      },
      {
        path: '/:pathMatch(.*)*',
        name: 'not-found',
        component: () => import('./views/NotFoundView.vue'),
        meta: { title: 'Page not found' },
      },
    ],
    scrollBehavior(to, from, saved) {
      const area = desktopScrollArea()
      if (!area) return saved ?? (to.path === from.path ? false : { top: 0 })

      if (saved && activePosition !== undefined) {
        const position = desktopScrollPositions.get(activePosition)
        area.scrollTop = position?.path === to.fullPath ? position.top : 0
      } else if (to.path !== from.path) {
        area.scrollTop = 0
      }
      return false
    },
  })
  router.beforeResolve((_to, from) => {
    const area = desktopScrollArea()
    if (area && activePosition !== undefined) {
      desktopScrollPositions.set(activePosition, { path: from.fullPath, top: area.scrollTop })
    }
  })
  router.afterEach((_to, _from, failure) => {
    if (failure) return
    const position = history.state.position
    activePosition = typeof position === 'number' ? position : undefined
  })
  router.beforeEach((to, from) => {
    if (to.name !== 'repository-reader' || from.name === 'repository-reader' || to.params.number)
      return
    if ((to.query.state && to.query.state !== 'open') || (to.query.page && to.query.page !== '1'))
      return
    const { accountId, owner, name, resource } = to.params
    if (resource !== 'pulls' && resource !== 'issues') return
    if (typeof accountId !== 'string' || typeof owner !== 'string' || typeof name !== 'string')
      return
    const account = useAccounts().accounts.value.find((value) => value.id === accountId)
    if (account?.credentialStatus === 'saved')
      prepareDiscussionList({ accountId, owner, name }, resource)
  })
  return router
}
