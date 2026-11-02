import { describe, expect, it } from 'vitest'
// The policy is also a dependency-free Node entry point for CI.
import { allowsPullRequest } from './branch-policy.mjs'

describe('pull request routing', () => {
  it.each([
    ['develop', 'feature/project-scaffold'],
    ['develop', 'fix/navigation'],
    ['develop', 'main'],
    ['release', 'develop'],
    ['release', 'main'],
    ['release', 'fix/candidate'],
    ['main', 'release'],
    ['main', 'fix/production'],
  ])('allows %s to receive %s', (base, head) => {
    expect(allowsPullRequest(base, head)).toBe(true)
  })

  it.each([
    ['main', 'feature/accounts'],
    ['main', 'develop'],
    ['release', 'feature/accounts'],
    ['develop', 'release'],
    ['develop', 'feature/'],
    ['develop', 'fix/'],
    ['develop', 'random-branch'],
    ['unknown', 'fix/example'],
  ])('rejects %s receiving %s', (base, head) => {
    expect(allowsPullRequest(base, head)).toBe(false)
  })
})
