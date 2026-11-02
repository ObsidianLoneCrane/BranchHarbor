import { pathToFileURL } from 'node:url'

export function allowsPullRequest(base, head) {
  const feature = /^feature\/.+/.test(head)
  const fix = /^fix\/.+/.test(head)
  if (base === 'develop') return feature || fix || head === 'main'
  if (base === 'release') return fix || head === 'develop' || head === 'main'
  if (base === 'main') return fix || head === 'release'
  return false
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { GITHUB_BASE_REF: base, GITHUB_HEAD_REF: head } = process.env
  if (!base || !head || !allowsPullRequest(base, head)) {
    console.error(
      `Unsupported pull request route: ${head ?? '(missing)'} -> ${base ?? '(missing)'}`,
    )
    process.exitCode = 1
  } else {
    console.log(`Allowed pull request route: ${head} -> ${base}`)
  }
}
