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
        if (command !== 'read_contribution_source') return invoke(command, args)
        const { accountId, day } = args
        const range = {
          startedAt: '2024-02-29T00:00:00Z',
          endedAt: '2024-02-29T23:59:59Z',
          restrictedContributionsCount: 0,
        }
        if (accountId === 'gitee:gitee.com:10' && day === null) {
          return { accountId, data: { source: 'giteePublicEvents', limit: 20, events: [] } }
        }
        if (day === '2024-02-29') {
          return {
            accountId,
            data: {
              source: 'githubDay',
              ...range,
              totalCommitContributions: 2,
              totalPullRequestContributions: 1,
              totalIssueContributions: 0,
            },
          }
        }
        return {
          accountId,
          data: {
            source: 'githubCalendar',
            ...range,
            calendar: { totalContributions: 4, weeks: [] },
          },
        }
      }
    }
    // Run after the fixture installs its IPC bridge and before the app module runs.
    document.addEventListener('DOMContentLoaded', install, { once: true })
  })
  await page.goto('/#/activity')
  const load = page.getByRole('button', { name: 'Load source' })
  await load.click()
  await expect(page.getByRole('heading', { name: 'GitHub calendar summary' })).toBeVisible()
  await expect(page.getByText('4 contributions', { exact: true })).toBeVisible()
  await page.getByLabel('UTC day (optional)').fill('2024-02-29')
  await expect(page.getByText('4 contributions', { exact: true })).toHaveCount(0)
  await load.click()
  await expect(page.getByText('Commits: 2')).toBeVisible()
  await expect(page.getByText('Pull requests opened: 1')).toBeVisible()
  await page.getByRole('combobox', { name: 'Account' }).selectOption('gitee:gitee.com:10')
  await expect(page.getByLabel('UTC day (optional)')).toHaveCount(0)
  await load.click()
  await expect(page.getByText('No events returned by this source.')).toBeVisible()
  await expect(page.getByText('Coverage dates are unknown.')).toBeVisible()
  await expect(page.getByText('Commits: 2')).toHaveCount(0)
})
