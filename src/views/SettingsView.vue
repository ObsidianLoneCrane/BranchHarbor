<script setup lang="ts">
import { Laptop, Monitor, Moon, Sun } from '@lucide/vue'
import { onMounted, ref } from 'vue'
import { useAppearance, type Appearance } from '../composables/appearance'
import { getRuntimeInfo, type RuntimeInfo } from '../lib/runtime'
import AccountConnections from '../components/AccountConnections.vue'
import DataStorage from '../components/DataStorage.vue'
import { language, setLanguage, t } from '../lib/locale'

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
      <h1 id="page-title" tabindex="-1">{{ t('Settings') }}</h1>
    </div>
  </div>
  <section class="settings-section" aria-labelledby="accounts-title">
    <div class="settings-intro">
      <h2 id="accounts-title">{{ t('Connected accounts') }}</h2>
      <p>{{ t('Your platforms, together in one place.') }}</p>
    </div>
    <AccountConnections />
  </section>
  <section class="settings-section" aria-labelledby="appearance-title">
    <div class="settings-intro">
      <h2 id="appearance-title">{{ t('Appearance') }}</h2>
    </div>
    <div class="panel appearance-panel">
      <label class="language-field">
        {{ t('Language') }}
        <select
          class="form-control"
          :value="language"
          @change="setLanguage(($event.target as HTMLSelectElement).value)"
        >
          <optgroup class="select-options" label="">
            <option value="en">{{ t('English') }}</option>
            <option value="zh-CN">{{ t('Simplified Chinese') }}</option>
          </optgroup>
        </select>
      </label>
      <div class="theme-options" role="radiogroup" :aria-label="t('Color theme')">
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
            t(option.label)
          }}</span></label
        >
      </div>
      <p class="panel-footnote">
        {{ t("Saved on this device. System follows your operating system's appearance.") }}
      </p>
    </div>
  </section>
  <DataStorage />
  <section class="settings-section" aria-labelledby="about-title">
    <div class="settings-intro">
      <h2 id="about-title">{{ t('About this workspace') }}</h2>
    </div>
    <div class="panel about-panel">
      <div class="about-brand">
        <Laptop :size="21" aria-hidden="true" /><strong>BranchHarbor</strong>
      </div>
      <dl v-if="runtime" class="runtime-details">
        <div>
          <dt>{{ t('Version') }}</dt>
          <dd>{{ runtime.version }}</dd>
        </div>
        <div>
          <dt>{{ t('Runtime') }}</dt>
          <dd>{{ t(runtime.platform) }}</dd>
        </div>
        <div>
          <dt>{{ t('Architecture') }}</dt>
          <dd>{{ runtime.architecture }}</dd>
        </div>
        <div>
          <dt>{{ t('License') }}</dt>
          <dd>MIT</dd>
        </div>
      </dl>
      <p v-else-if="runtimeError" class="runtime-error" role="alert">
        {{ t('Runtime information could not be loaded.') }}
        <button class="text-button" @click="loadRuntime">{{ t('Try again') }}</button>
      </p>
      <p v-else role="status" class="panel-footnote">{{ t('Loading runtime information...') }}</p>
    </div>
  </section>
</template>
