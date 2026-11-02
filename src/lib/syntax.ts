import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import rust from 'highlight.js/lib/languages/rust'
import python from 'highlight.js/lib/languages/python'
import json from 'highlight.js/lib/languages/json'
import css from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml'
import bash from 'highlight.js/lib/languages/bash'

for (const [name, language] of Object.entries({
  javascript,
  typescript,
  rust,
  python,
  json,
  css,
  xml,
  bash,
}))
  hljs.registerLanguage(name, language)
const extensions: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  rs: 'rust',
  py: 'python',
  json: 'json',
  css: 'css',
  html: 'xml',
  htm: 'xml',
  xml: 'xml',
  svg: 'xml',
  vue: 'xml',
  sh: 'bash',
  bash: 'bash',
}
export function highlightSource(path: string, text: string) {
  const extension = path.split('.').at(-1)?.toLowerCase() ?? ''
  const language = Object.hasOwn(extensions, extension) ? extensions[extension]! : null
  return {
    language,
    html: language ? hljs.highlight(text, { language, ignoreIllegals: true }).value : null,
  }
}
