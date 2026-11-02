import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const files = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean)
const errors = []
let links = 0
for (const file of files) {
  if (!/\.(?:md|json|[cm]?js|ts|vue|css|html|svg|rs|toml|ya?ml|ps1)$/.test(file)) continue
  const text = readFileSync(file, 'utf8')
  if (/\p{Script=Han}|[\u3000-\u303f\uff00-\uffef]/u.test(text))
    errors.push(`Unexpected CJK text: ${file}`)
  if (!file.endsWith('.md')) continue
  if (text.split(/\r?\n/).filter((line) => /^```/.test(line)).length % 2)
    errors.push(`Unbalanced code fence: ${file}`)
  for (const match of text.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
    const target = match[1].trim()
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue
    if (!existsSync(path.resolve(path.dirname(file), decodeURIComponent(target.split('#')[0]))))
      errors.push(`Broken link: ${file} -> ${target}`)
    links++
  }
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'))
const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8').match(/^version = "([^"]+)"/m)?.[1]
const toolchain = readFileSync('rust-toolchain.toml', 'utf8').match(/^channel = "([^"]+)"/m)?.[1]
const tools = JSON.parse(readFileSync('scripts/windows/tool-versions.json', 'utf8'))
if (readFileSync('.node-version', 'utf8').trim() !== tools.node)
  errors.push('Node bootstrap and .node-version must match.')
if (pkg.version !== config.version || pkg.version !== cargo)
  errors.push('Application versions must match across npm, Cargo, and Tauri.')
if (toolchain !== tools.rust) errors.push('Rust bootstrap and rust-toolchain.toml must match.')
if (pkg.packageManager !== `pnpm@${tools.pnpm}`)
  errors.push('pnpm bootstrap and packageManager must match.')
if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  console.log(
    `Project checks passed: ${files.length} files, ${links} local documentation links, language and version consistency.`,
  )
}
