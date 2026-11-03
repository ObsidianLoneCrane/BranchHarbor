import { native } from './accounts'

interface GitHubRange {
  startedAt: string
  endedAt: string
  restrictedContributionsCount: number
}

type GitHubCalendar = GitHubRange & {
  source: 'githubCalendar'
  calendar: {
    totalContributions: number
    weeks: {
      contributionDays: {
        date: string
        contributionCount: number
        contributionLevel: string
      }[]
    }[]
  }
}

type GitHubDay = GitHubRange & {
  source: 'githubDay'
  totalCommitContributions: number
  totalPullRequestContributions: number
  totalIssueContributions: number
}

type GiteeEvents = {
  source: 'giteePublicEvents'
  limit: number
  events: {
    id: string
    eventType: string | null
    createdAt: string
    repository?: { name: string | null }
  }[]
}

export type ContributionSource = GitHubCalendar | GitHubDay | GiteeEvents

export function readContributionSource(accountId: string, day: string | null) {
  return native<{ accountId: string; data: ContributionSource }>('read_contribution_source', {
    accountId,
    day,
  })
}
