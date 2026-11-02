import { createRouter, createWebHashHistory, type RouterHistory } from 'vue-router'

export function createAppRouter(history: RouterHistory = createWebHashHistory()) {
  return createRouter({
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
        path: '/repositories/:accountId/:owner/:name',
        name: 'repository-explorer',
        component: () => import('./views/RepositoryExplorerView.vue'),
        meta: { title: 'Repository' },
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
    scrollBehavior: () => ({ top: 0 }),
  })
}
