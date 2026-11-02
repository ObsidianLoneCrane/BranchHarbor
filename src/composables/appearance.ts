import { computed, ref } from 'vue'

export type Appearance = 'light' | 'dark' | 'system'
const storageKey = 'branchharbor.appearance'
const appearance = ref<Appearance>('system')
const systemDark = ref(false)

function apply() {
  document.documentElement.dataset.theme =
    appearance.value === 'system' ? (systemDark.value ? 'dark' : 'light') : appearance.value
}

export function initializeAppearance() {
  try {
    const stored = localStorage.getItem(storageKey)
    appearance.value = stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    appearance.value = 'system'
  }
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  systemDark.value = media.matches
  const onChange = (event: MediaQueryListEvent) => {
    systemDark.value = event.matches
    apply()
  }
  media.addEventListener('change', onChange)
  apply()
  return () => media.removeEventListener('change', onChange)
}

export function useAppearance() {
  const isDark = computed(
    () => appearance.value === 'dark' || (appearance.value === 'system' && systemDark.value),
  )
  function setAppearance(value: Appearance) {
    appearance.value = value
    try {
      localStorage.setItem(storageKey, value)
    } catch {
      /* Preferences remain usable when storage is unavailable. */
    }
    apply()
  }
  return { appearance, isDark, setAppearance }
}
