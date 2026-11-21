import { readonly, ref } from 'vue'
import simplifiedChinese from '../locales/zh-CN.json'

const key = 'branchharbor.language'
const labels: Record<string, string> = simplifiedChinese
function initialLanguage() {
  try {
    return localStorage.getItem(key) === 'zh-CN' ? 'zh-CN' : 'en'
  } catch {
    return 'en'
  }
}
const current = ref(initialLanguage())
export const language = readonly(current)

export function setLanguage(value: string) {
  current.value = value === 'zh-CN' ? 'zh-CN' : 'en'
  document.documentElement.lang = current.value
  try {
    localStorage.setItem(key, current.value)
  } catch {
    return
  }
}

export function t(message: string, values: Record<string, string | number> = {}) {
  const label =
    current.value === 'zh-CN' && Object.hasOwn(labels, message) ? labels[message]! : message
  return label.replace(/\{(\w+)\}/g, (placeholder: string, name: string) =>
    String(values[name] ?? placeholder),
  )
}
