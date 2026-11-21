import { invoke } from '@tauri-apps/api/core'

export interface Commit {
  hash: string
  parents: string[]
  refs: string[]
  author: string
  date: string
  subject: string
  message: string
}

export function localHistory(id: number) {
  return invoke<{ commits: Commit[]; limited: boolean }>('read_local_history', { id })
}

const paletteSize = 12

export function historyLaneColor(color: number) {
  const hue = ((color - paletteSize) * 137.508) % 360
  return `var(--graph-${color}, oklch(var(--graph-extra-lightness) 0.13 ${hue}))`
}

export function layoutHistory(commits: Commit[]) {
  let lanes: { hash: string; color: number }[] = []
  let nextColor = 0
  function allocateColor(used: Set<number>) {
    for (let offset = 0; offset < paletteSize; offset++) {
      const candidate = (nextColor + offset) % paletteSize
      if (!used.has(candidate)) {
        nextColor = (candidate + 1) % paletteSize
        used.add(candidate)
        return candidate
      }
    }
    let candidate = paletteSize
    while (used.has(candidate)) candidate++
    used.add(candidate)
    return candidate
  }
  return commits.map((commit) => {
    const used = new Set(lanes.map((entry) => entry.color))
    const existing = lanes.find((entry) => entry.hash === commit.hash)
    const current = existing ?? { hash: commit.hash, color: allocateColor(used) }
    if (!existing) lanes.push(current)
    const before = lanes
    const lane = before.indexOf(current)
    lanes = before.filter((entry) => entry !== current)
    const parents = [...new Set(commit.parents)].map((hash, index) => {
      const active = lanes.find((entry) => entry.hash === hash)
      if (active) return active
      const parent = { hash, color: index === 0 ? current.color : allocateColor(used) }
      if (index === 0) lanes.splice(lane, 0, parent)
      else lanes.push(parent)
      return parent
    })
    return {
      commit,
      lane,
      color: current.color,
      incoming: !!existing,
      width: Math.max(before.length, lanes.length),
      lines: [
        ...before.flatMap((entry, index) =>
          entry === current
            ? []
            : [
                {
                  from: index,
                  to: lanes.indexOf(entry),
                  startsAtCommit: false,
                  color: entry.color,
                },
              ],
        ),
        ...parents.map((parent) => ({
          from: lane,
          to: lanes.indexOf(parent),
          startsAtCommit: true,
          color: parent.color,
        })),
      ],
    }
  })
}
