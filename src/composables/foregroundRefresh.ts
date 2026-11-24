import { onActivated, onDeactivated, onMounted, onUnmounted } from 'vue'

export function useForegroundRefresh(refresh: () => void) {
  let active = true
  function resume() {
    if (active && document.visibilityState === 'visible' && document.hasFocus()) refresh()
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('focus', resume)
  })
  onActivated(() => {
    active = true
    resume()
  })
  onDeactivated(() => {
    active = false
  })
  onUnmounted(() => {
    document.removeEventListener('visibilitychange', resume)
    window.removeEventListener('focus', resume)
  })
  return () => active
}
