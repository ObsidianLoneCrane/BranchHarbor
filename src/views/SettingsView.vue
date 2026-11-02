<script setup lang="ts">
import { Laptop, Monitor, Moon, Sun } from '@lucide/vue'
import { onMounted, ref } from 'vue'
import { useAppearance, type Appearance } from '../composables/appearance'
import { getRuntimeInfo, type RuntimeInfo } from '../lib/runtime'

const { appearance, setAppearance } = useAppearance()
const options: { value: Appearance; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]
const runtime = ref<RuntimeInfo>()
const runtimeError = ref(false)
async function loadRuntime() {
  runtimeError.value = false
  try {
    runtime.value = await getRuntimeInfo()
  } catch {
    runtimeError.value = true
  }
}
onMounted(loadRuntime)
</script>

<template>
  <div class="page-heading">
    <div>
      <p class="eyebrow">MAKE YOURSELF AT HOME</p>
      <h1 id="page-title" tabindex="-1">Settings</h1>
      <p class="page-description">A workspace that feels like yours.</p>
    </div>
  </div>
  <section class="settings-section" aria-labelledby="accounts-title">
    <div class="settings-intro">
      <h2 id="accounts-title">Connected accounts</h2>
      <p>Your platforms, together in one place.</p>
    </div>
    <div class="panel">
      <div v-for="provider in ['GitHub', 'Gitee']" :key="provider" class="account-row">
        <span class="provider-mark" :class="{ gitee: provider === 'Gitee' }" aria-hidden="true">{{
          provider === 'GitHub' ? 'GH' : 'G'
        }}</span>
        <div class="account-description">
          <h3>{{ provider }}</h3>
          <p>Account authorization is not available yet.</p>
        </div>
        <span class="coming-soon">Coming soon</span>
      </div>
      <div class="panel-footnote">
        Platform login, Git author identity, and push credentials will be configured separately.
      </div>
    </div>
  </section>
  <section class="settings-section" aria-labelledby="appearance-title">
    <div class="settings-intro">
      <h2 id="appearance-title">Appearance</h2>
      <p>Choose the view that works for you.</p>
    </div>
    <div class="panel appearance-panel">
      <div class="theme-options" role="radiogroup" aria-label="Color theme">
        <label
          v-for="option in options"
          :key="option.value"
          class="theme-option"
          :class="{ active: appearance === option.value }"
          ><input
            type="radio"
            name="appearance"
            :value="option.value"
            :checked="appearance === option.value"
            @change="setAppearance(option.value)"
          /><component :is="option.icon" :size="20" aria-hidden="true" /><span>{{
            option.label
          }}</span></label
        >
      </div>
      <p class="panel-footnote">
        Saved on this device. System follows your operating system's appearance.
      </p>
    </div>
  </section>
  <section class="settings-section" aria-labelledby="about-title">
    <div class="settings-intro">
      <h2 id="about-title">About this workspace</h2>
      <p>Built with a lighter footprint in mind.</p>
    </div>
    <div class="panel about-panel">
      <div class="about-brand">
        <Laptop :size="21" aria-hidden="true" /><strong>BranchHarbor</strong
        ><span class="subtle-badge">Foundation preview</span>
      </div>
      <dl v-if="runtime" class="runtime-details">
        <div>
          <dt>Version</dt>
          <dd>{{ runtime.version }}</dd>
        </div>
        <div>
          <dt>Runtime</dt>
          <dd>{{ runtime.platform }}</dd>
        </div>
        <div>
          <dt>Architecture</dt>
          <dd>{{ runtime.architecture }}</dd>
        </div>
        <div>
          <dt>License</dt>
          <dd>MIT</dd>
        </div>
      </dl>
      <p v-else-if="runtimeError" class="runtime-error" role="alert">
        Runtime information could not be loaded.
        <button class="text-button" @click="loadRuntime">Try again</button>
      </p>
      <p v-else role="status" class="panel-footnote">Loading runtime information...</p>
    </div>
  </section>
</template>
