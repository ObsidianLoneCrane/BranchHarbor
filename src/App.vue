<script setup lang="ts">
import { Activity, ArrowUpRight, FolderGit2, House, Moon, Settings2, Sun } from '@lucide/vue'
import { nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAppearance } from './composables/appearance'
import { version } from '../package.json'

const route = useRoute()
const brandIcon = '/brand.svg'
const { isDark, setAppearance } = useAppearance()
const navigation = [
  { to: '/', label: 'Home', icon: House },
  { to: '/repositories', label: 'Repositories', icon: FolderGit2 },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings2 },
]
watch(
  () => route.fullPath,
  async () => {
    document.title = `${String(route.meta.title ?? 'Workspace')} · BranchHarbor`
    await nextTick()
    document.getElementById('page-title')?.focus({ preventScroll: true })
  },
  { immediate: true },
)
</script>

<template>
  <a href="#main-content" class="skip-link">Skip to content</a>
  <div class="application-shell">
    <aside class="sidebar">
      <RouterLink to="/" class="brand" aria-label="BranchHarbor home"
        ><img :src="brandIcon" alt="" width="34" height="34" /><span
          >BranchHarbor<span class="brand-caption">Your code. A little calmer.</span></span
        ></RouterLink
      >
      <div class="navigation-label">WORKSPACE</div>
      <nav aria-label="Main navigation">
        <RouterLink
          v-for="item in navigation"
          :key="item.to"
          :to="item.to"
          class="nav-link"
          :class="{ selected: route.path === item.to }"
          :aria-current="route.path === item.to ? 'page' : undefined"
          :aria-label="item.label"
        >
          <component :is="item.icon" :size="19" :stroke-width="1.7" aria-hidden="true" /><span>{{
            item.label
          }}</span
          ><span v-if="route.path === item.to" class="nav-current-dot" aria-hidden="true" />
        </RouterLink>
      </nav>
      <div class="sidebar-bottom">
        <div class="sidebar-note">
          <span class="small-symbol" aria-hidden="true">B</span>
          <div><strong>Personal workspace</strong><span>Local-first. Open source.</span></div>
        </div>
        <div class="version-line">
          <span>v{{ version }}</span
          ><span><span class="status-dot accent-dot" />Early development</span>
        </div>
      </div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <div class="breadcrumb">
          <span>Workspace</span><span class="breadcrumb-separator" aria-hidden="true">/</span
          ><strong>{{ route.meta.title }}</strong>
        </div>
        <div class="topbar-actions">
          <span class="preview-badge">Development preview</span
          ><button
            class="icon-button"
            :aria-label="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
            @click="setAppearance(isDark ? 'light' : 'dark')"
          >
            <Sun v-if="isDark" :size="18" /><Moon v-else :size="18" />
          </button>
        </div>
      </header>
      <main id="main-content" class="page-content" tabindex="-1"><RouterView /></main>
      <footer class="workspace-footer">
        <span>A quieter place to keep your work moving.</span
        ><RouterLink to="/settings"
          >Workspace settings<ArrowUpRight :size="13" aria-hidden="true"
        /></RouterLink>
      </footer>
    </div>
  </div>
</template>
