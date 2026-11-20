import { expect, test } from '@playwright/test'
import { installExplorerFixture } from './explorer-fixture'

test('keeps GitHub calendar and daily counts separate from Gitee public events', async ({
  page,
}) => {
  await installExplorerFixture(page)
  await page.addInitScript(() => {
    const install = () => {
      const internals = (
        window as unknown as {
          __TAURI_INTERNALS__: {
            invoke: (command: string, args: Record<string, unknown>) => Promise<unknown>
          }
        }
      ).__TAURI_INTERNALS__
      const invoke = internals.invoke
      internals.invoke = async (command, args) => {
        if (command === 'read_cached_contribution_source') {
          return JSON.parse(
            localStorage.getItem(JSON.stringify([args.accountId, args.day])) ?? 'null',
          )
        }
        if (command === 'list_local_repositories') return [{ id: 7, path: 'C:/Projects/Example' }]
        if (command === 'read_local_activity') {
          return {
            day: args.day,
            limited: false,
            skippedRepositories: 0,
            commits: [
              {
                repositoryId: 7,
                repositoryPath: 'C:/Projects/Example',
                hash: 'a'.repeat(40),
                author: 'Sample Author',
                subject: 'A local commit',
                committedAt: Date.parse(String(args.day) + 'T10:00:00Z') / 1000,
              },
            ],
          }
        }
        if (command !== 'read_contribution_source') return invoke(command, args)
        if (localStorage.getItem('fixture-offline')) throw { code: 'network' }
        const { accountId, day } = args
        const respond = (data: object) => {
          const response = { accountId, data, refreshedAt: 1_709_222_400 }
          localStorage.setItem(JSON.stringify([accountId, day]), JSON.stringify(response))
          return response
        }
        const range = {
          startedAt: '2024-02-29T00:00:00Z',
          endedAt: '2024-02-29T23:59:59Z',
          restrictedContributionsCount: 0,
        }
        if (accountId === 'gitee:gitee.com:10' && day === null) {
          return respond({
            source: 'giteePublicEvents',
            limit: 20,
            events: [
              {
                id: '71',
                createdAt: '2024-03-01T03:30:00+08:00',
                eventType: 'PushEvent',
                repository: { name: 'fixture/project' },
              },
            ],
          })
        }
        if (day === '2024-02-29') {
          return respond({
            source: 'githubDay',
            ...range,
            totalCommitContributions: 2,
            totalPullRequestContributions: 1,
            totalIssueContributions: 0,
          })
        }
        return respond({
          source: 'githubCalendar',
          ...range,
          calendar: {
            totalContributions: 4,
            weeks: [
              {
                contributionDays: [
                  { date: '2024-02-28', contributionCount: 0, contributionLevel: 'NONE' },
                  {
                    date: '2024-02-29',
                    contributionCount: 4,
                    contributionLevel: 'SECOND_QUARTILE',
                  },
                ],
              },
            ],
          },
        })
      }
    }
    // Run after the fixture installs its IPC bridge and before the app module runs.
    document.addEventListener('DOMContentLoaded', install, { once: true })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Refresh GitHub' }).click()
  await page.getByLabel('Calendar day').selectOption('2024-02-28')
  await expect(page.getByText('2024-02-28 · 0 contributions')).toBeVisible()
  await page.getByLabel('Calendar day').selectOption('2024-02-29')
  await page.getByRole('button', { name: 'View activity' }).click()
  await expect(page.getByLabel('UTC day (optional)')).toHaveValue('2024-02-29')
  await expect(page.getByText('A local commit')).toBeVisible()
  const load = page.getByRole('button', { name: 'Load source' })
  await page.getByLabel('UTC day (optional)').fill('')
  await expect(page.getByText('4 contributions', { exact: true })).toBeVisible()
  await page.getByLabel('UTC day (optional)').fill('2024-02-29')
  await expect(page.getByText('4 contributions', { exact: true })).toHaveCount(0)
  await load.click()
  await expect(page.getByText('Commits: 2')).toBeVisible()
  await expect(page.getByText('Pull requests opened: 1')).toBeVisible()
  await page.getByRole('combobox', { name: 'Account' }).selectOption('gitee:gitee.com:10')
  await load.click()
  await expect(page.getByText('fixture/project')).toBeVisible()
  await expect(page.getByText('Coverage dates are unknown.')).toBeVisible()
  await expect(page.getByText('Commits: 2')).toHaveCount(0)
  await page.getByLabel('UTC day (optional)').fill('2024-03-01')
  await expect(page.getByText('No events in the public sample match this UTC day.')).toBeVisible()
  await page.evaluate(() => localStorage.setItem('fixture-offline', 'true'))
  await page.goto('/#/activity?account=github:github.com:1&day=2024-02-29')
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Account' })).toHaveValue('github:github.com:1')
  await expect(page.getByLabel('UTC day (optional)')).toHaveValue('2024-02-29')
  await expect(page.getByText('Cached data · Last refreshed')).toBeVisible()
  await page.getByRole('button', { name: 'Refresh source' }).click()
  await expect(page.getByText('The provider could not be reached.')).toBeVisible()
  await expect(page.getByText('Commits: 2')).toBeVisible()
})
