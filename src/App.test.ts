import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import App from './App.vue'
import { createAppRouter } from './router'
import { initializeAppearance } from './composables/appearance'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

async function openApp(path = '/') {
  initializeAppearance()
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  await router.isReady()
  const wrapper = mount(App, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('application navigation', () => {
  it('keeps unavailable platform contributions separate without inventing counts', async () => {
    const { wrapper } = await openApp()
    expect(wrapper.find('[aria-label="GitHub contributions"]').text()).toContain('Not connected')
    expect(wrapper.find('[aria-label="Gitee contributions"]').text()).toContain('Not connected')
    expect(wrapper.findAll('.calendar-message')).toHaveLength(2)
    expect(wrapper.text()).not.toContain('0 contributions')
    wrapper.unmount()
  })

  it('navigates between tasks and restores the previous route on back navigation', async () => {
    const { wrapper, router } = await openApp()
    await wrapper.get('nav a[href="/repositories"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.get('h1').text()).toBe('Repositories'))
    expect(wrapper.get('button[disabled]').text()).toContain('New repository')
    await router.push('/activity')
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('Activity')
    router.back()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/repositories'))
    await flushPromises()
    expect(wrapper.get('nav a[aria-current="page"]').attributes('aria-label')).toBe('Repositories')
    wrapper.unmount()
  })

  it('lets users recover from an unknown route', async () => {
    const { wrapper } = await openApp('/missing-page')
    expect(wrapper.get('h1').text()).toBe('Page not found')
    await wrapper.get('main a').trigger('click')
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('A clearer view of your work.')
    wrapper.unmount()
  })

  it('persists appearance while showing browser runtime information honestly', async () => {
    const { wrapper } = await openApp('/settings')
    expect(wrapper.text()).toContain('Browser preview')
    await wrapper.get('input[value="dark"]').setValue()
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('branchharbor.appearance')).toBe('dark')
    await wrapper.get('button[aria-label="Switch to light theme"]').trigger('click')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('branchharbor.appearance')).toBe('light')
    wrapper.unmount()
  })

  it('keeps appearance usable when preference storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable')
    })
    const { wrapper } = await openApp('/settings')
    await wrapper.get('input[value="dark"]').setValue()
    expect(document.documentElement.dataset.theme).toBe('dark')
    wrapper.unmount()
  })
})
