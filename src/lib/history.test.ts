import { expect, it } from 'vitest'
import { historyLaneColor, layoutHistory, type Commit } from './history'

function commit(hash: string, parents: string[] = []): Commit {
  return { hash, parents, refs: [], author: '', date: '', subject: '', message: '' }
}

it('keeps concurrent history lanes distinct and continues first-parent colors', () => {
  const parents = Array.from({ length: 15 }, (_, index) => `branch-${index}`)
  const [merge, first, other] = layoutHistory([
    commit('merge', parents),
    commit(parents[0]!, ['base']),
    commit(parents[1]!, ['base']),
  ])
  expect(new Set(merge!.lines.map(({ color }) => historyLaneColor(color))).size).toBe(15)
  expect(first!.color).toBe(merge!.color)
  expect(first!.lines.find((line) => line.startsAtCommit)?.color).toBe(first!.color)
  expect(other!.color).toBe(merge!.lines[1]?.color)
  expect(other!.lines.find((line) => line.startsAtCommit)?.color).toBe(first!.color)
})
