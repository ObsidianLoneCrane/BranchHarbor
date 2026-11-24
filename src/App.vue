<script setup lang="ts">
import { Activity, FolderGit2, House, Moon, Settings2, Sun } from '@lucide/vue'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow, type Window } from '@tauri-apps/api/window'
import { nextTick, onMounted, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import WindowTitleBar from './components/WindowTitleBar.vue'
import { useAppearance } from './composables/appearance'
import { useAccounts } from './composables/accounts'
import { language, setLanguage, t } from './lib/locale'

const route = useRoute()
const desktopWindow = shallowRef<Window>()
const isSelected = (to: string) =>
  route.path === to || (to === '/repositories' && route.path.startsWith('/repositories/'))
onMounted(() => {
  setLanguage(language.value)
  void useAccounts().ensureLoaded()
  if (isTauri()) void readWindowFrame()
})
async function readWindowFrame() {
  try {
    const current = getCurrentWindow()
    if ((await current.isDecorated()) === false) desktopWindow.value = current
  } catch {
    return
  }
}
const brandIcon = '/brand.svg'
const { isDark, setAppearance } = useAppearance()
const navigation = [
  { to: '/', label: 'Home', icon: House },
  { to: '/repositories', label: 'Repositories', icon: FolderGit2 },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings2 },
]
watch(
  [() => route.fullPath, language],
  () => {
    document.title = `${t(String(route.meta.title ?? 'Workspace'))} · BranchHarbor`
  },
  { immediate: true },
)
watch(
  () => route.path,
  async () => {
    await nextTick()
    document.getElementById('page-title')?.focus({ preventScroll: true })
  },
  { immediate: true },
)
</script>

<template>
  <a href="#main-content" class="skip-link">{{ t('Skip to content') }}</a>
  <div class="app-frame" :class="{ 'app-frame-desktop': desktopWindow }">
    <header class="app-header">
      <WindowTitleBar v-if="desktopWindow" :desktop-window="desktopWindow" :icon="brandIcon" />
      <div class="app-bar">
        <RouterLink v-if="!desktopWindow" to="/" class="brand" :aria-label="t('BranchHarbor home')"
          ><img :src="brandIcon" alt="" width="30" height="30" /><span
            >BranchHarbor</span
          ></RouterLink
        >
        <nav class="app-navigation" :aria-label="t('Main navigation')">
          <RouterLink
            v-for="item in navigation"
            :key="item.to"
            :to="item.to"
            class="nav-link"
            :class="{ selected: isSelected(item.to) }"
            :aria-current="isSelected(item.to) ? 'page' : undefined"
            :aria-label="t(item.label)"
          >
            <component :is="item.icon" :size="16" :stroke-width="1.7" aria-hidden="true" /><span>{{
              t(item.label)
            }}</span>
          </RouterLink>
        </nav>
        <div class="topbar-actions">
          <button
            class="button button-secondary"
            type="button"
            :aria-label="t('Switch language')"
            @click="setLanguage(language === 'en' ? 'zh-CN' : 'en')"
          >
            {{ language === 'en' ? 'EN' : 'ZH' }}
          </button>
          <button
            class="icon-button"
            :aria-label="t(isDark ? 'Switch to light theme' : 'Switch to dark theme')"
            @click="setAppearance(isDark ? 'light' : 'dark')"
          >
            <Sun v-if="isDark" :size="18" /><Moon v-else :size="18" />
          </button>
        </div>
      </div>
    </header>
    <div class="workspace-scroll">
      <main id="main-content" class="page-content" tabindex="-1">
        <RouterView v-slot="{ Component, route: current }"
          ><KeepAlive include="RepositoriesView,RepositoryExplorerView" :max="8"
            ><component
              :is="Component"
              :key="
                current.name === 'repository-explorer' ? current.path : String(current.name)
              " /></KeepAlive
        ></RouterView>
      </main>
    </div>
  </div>
</template>
