import { expect, test } from '@playwright/test'

test.use({ timezoneId: 'Asia/Shanghai' })

test('creates and clones repositories in a modal with focus and retry', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const repositories: { id: number; path: string }[] = []
    Object.defineProperty(window, 'isTauri', { value: true })
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {
        async invoke(command: string, args: Record<string, unknown> = {}) {
          if (command === 'list_accounts' || command === 'list_repository_links') return []
          if (command === 'list_local_repositories') return repositories
          if (command === 'pick_repository_folder') return 'C:/Projects/new-repository'
          if (command === 'add_local_repository') {
            const request = args.request as { kind: string; path: string; url?: string }
            if (
              request.kind === 'clone' &&
              request.url !== 'https://github.com/example/project.git'
            )
              throw 'invalidRemote'
            const repository = { id: repositories.length + 1, path: request.path }
            repositories.push(repository)
            return repository
          }
          throw new Error(command)
        },
      },
    })
  })
  await page.setViewportSize({ width: 540, height: 640 })
  await page.goto('/#/repositories')
  const add = page.getByRole('button', { name: 'Add repository', exact: true })
  await add.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toHaveAccessibleName('Add repository')
  await page.screenshot({ path: testInfo.outputPath('add-repository.png') })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(add).toBeFocused()
  await add.click()
  await dialog.getByRole('button', { name: 'New repository' }).click()
  await expect(dialog.getByLabel('Destination folder path')).toBeFocused()
  await dialog.getByRole('button', { name: 'Browse', exact: true }).click()
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('heading', { name: 'new-repository' })).toBeVisible()
  await add.click()
  await dialog.getByRole('button', { name: 'Clone repository' }).click()
  const url = dialog.getByLabel('Remote URL')
  await expect(url).toBeFocused()
  await url.fill('invalid fixture')
  await dialog.getByLabel('Destination folder path').fill('C:/Projects/cloned-repository')
  await dialog.getByRole('button', { name: 'Clone', exact: true }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await url.fill('https://github.com/example/project.git')
  await dialog.getByRole('button', { name: 'Clone', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('heading', { name: 'cloned-repository' })).toBeVisible()
})

test('combines linked repositories and sorts recent activity across sources', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const accounts = [
      { id: 'github:github.com:1', provider: 'github', login: 'alice' },
      { id: 'gitee:gitee.com:2', provider: 'gitee', login: 'jane' },
    ].map((account) => ({ ...account, credentialStatus: 'saved', verifiedAt: 1 }))
    const local = { id: 1, path: 'C:/Projects/Workspace' }
    Object.defineProperty(window, 'isTauri', { value: true })
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {
        async invoke(command: string, args: Record<string, unknown> = {}) {
          if (command === 'list_accounts') return accounts
          if (command === 'list_local_repositories') return [local]
          if (command === 'list_repository_links')
            return [[1, ['github.com/alice/workspace', 'gitee.com/jane/workspace']]]
          if (command === 'list_repositories') {
            const { accountId, page } = args.query as { accountId: string; page: number }
            const account = accounts.find((item) => item.id === accountId)!
            const name = `${account.login}/workspace`
            return {
              accountId,
              page,
              hasNext: false,
              items: [{ id: '1', name: 'workspace', owner: account.login, fullName: name }],
            }
          }
          if (command === 'read_recent_local_activity')
            return {
              limited: false,
              skippedRepositories: 0,
              commits: [
                {
                  repositoryId: local.id,
                  repositoryPath: local.path,
                  hash: 'a'.repeat(40),
                  author: 'Sample Author',
                  subject: 'Earlier local commit',
                  committedAt: Date.parse('2026-11-20T14:00:00Z') / 1000,
                },
              ],
            }
          if (command === 'read_recent_github_activity')
            return [
              {
                id: '71',
                eventType: 'PushEvent',
                createdAt: '2026-11-22T12:00:00Z',
                repository: 'alice/workspace',
              },
            ]
          if (command === 'read_cached_contribution_source') return null
          if (command === 'read_contribution_source')
            return {
              data: {
                source: 'giteePublicEvents',
                events: [
                  {
                    id: '71',
                    eventType: 'IssuesEvent',
                    createdAt: '2026-11-22T01:00:00+08:00',
                    repository: { name: 'jane/workspace' },
                  },
                ],
              },
            }
          throw new Error(command)
        },
      },
    })
  })
  await page.goto('/')
  const home = page.getByRole('region', { name: 'Frequently used repositories' })
  await expect(home.getByRole('listitem')).toHaveCount(1)
  await expect(home.getByRole('listitem')).toContainText(/Local.*GitHub.*Gitee/)
  await expect(home.getByRole('link', { name: 'Local workspace' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('home.png') })
  await page.getByRole('link', { name: 'All repositories' }).click()
  const catalog = page.getByRole('region', { name: 'Repository workspace' })
  await expect(catalog.getByLabel('Repository source').locator('option')).toHaveText([
    'All sources',
    'Local',
    'GitHub',
    'Gitee',
  ])
  await catalog.getByLabel('Repository source').selectOption('gitee')
  await expect(catalog.getByRole('listitem')).toHaveCount(1)
  await expect(catalog.getByRole('link', { name: 'Gitee · jane/workspace' })).toBeVisible()
  await catalog.getByRole('searchbox').fill('missing')
  await expect(catalog.getByRole('listitem')).toHaveCount(0)
  await page.getByRole('link', { name: 'Activity', exact: true }).click()
  const timeline = page.getByRole('region', { name: 'Recent activity' })
  await expect(timeline.getByRole('heading')).toHaveText([
    'Sunday, November 22, 2026',
    'Friday, November 20, 2026',
  ])
  await expect(
    timeline.getByRole('list', { name: 'Sunday, November 22, 2026' }).getByRole('listitem'),
  ).toHaveText([/Push.*alice\/workspace/, /Issue.*jane\/workspace/])
  await expect(timeline.getByRole('list', { name: 'Friday, November 20, 2026' })).toContainText(
    'Earlier local commit',
  )
  const colors = await timeline
    .locator('.timeline-repository')
    .evaluateAll((items) => items.map((item) => getComputedStyle(item).color))
  expect(new Set(colors).size).toBe(3)
  await page.screenshot({ path: testInfo.outputPath('activity.png') })
  await page.getByLabel('Activity source').selectOption('local')
  await expect(timeline.getByRole('listitem')).toHaveCount(1)
  await expect(timeline.getByRole('listitem')).toContainText('Earlier local commit')
  await page.getByLabel('Activity source').selectOption('all')
  await page.goto('/#/activity?day=2026-11-20&view=local')
  await expect(timeline.getByRole('heading', { name: 'Sunday, November 22, 2026' })).toBeVisible()
  await expect(page.getByText('UTC date range', { exact: true })).toHaveCount(0)
})

test('schedules and cancels a folder move and confirms cache cleanup', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    let pendingPath: string | null = null
    let cacheBytes = 8192
    Object.defineProperty(window, 'isTauri', { value: true })
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {
        async invoke(command: string, args: Record<string, unknown> = {}) {
          if (command === 'list_accounts') return []
          if (command === 'get_runtime_info')
            return { version: '0.1.0', platform: 'windows', architecture: 'x86_64' }
          if (command === 'get_storage_info')
            return {
              path: 'C:/Users/Fixture/BranchHarbor',
              pendingPath,
              databaseBytes: 40000,
              migrationFailed: false,
            }
          if (command === 'pick_repository_folder') {
            if (args.title !== 'Choose a data folder') throw 'folderPicker'
            return 'D:/BranchHarborData'
          }
          if (command === 'schedule_data_move') {
            pendingPath = args.folder as string | null
            return
          }
          if (command === 'cache_storage') {
            if (args.clear) cacheBytes = 0
            return cacheBytes
          }
          throw new Error(command)
        },
      },
    })
  })
  await page.goto('/#/settings')
  const storage = page.getByRole('region', { name: 'Data and storage' })
  await expect(storage).toContainText('C:/Users/Fixture/BranchHarbor')
  await expect(storage).toContainText('8 KiB')
  await storage.getByRole('button', { name: 'Change data folder' }).click()
  await expect(storage.getByRole('status')).toContainText('D:/BranchHarborData')
  await storage.getByRole('button', { name: 'Cancel move' }).click()
  await expect(storage.getByRole('status')).toHaveCount(0)
  await storage.getByRole('button', { name: 'Clear cached data' }).click()
  await expect(storage).toContainText('8 KiB')
  await storage.getByRole('button', { name: 'Clear cache', exact: true }).click()
  await expect(storage.getByRole('status')).toHaveText('Cached data cleared.')
  await expect(storage.getByText('0 B', { exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'Language' }).selectOption('zh-CN')
  await page.getByRole('radio', { name: '\u6df1\u8272', exact: true }).check()
  await page.setViewportSize({ width: 720, height: 760 })
  await expect(page.locator('#storage-title')).toHaveText('\u6570\u636e\u4e0e\u5b58\u50a8')
  await page.locator('#storage-title').scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('storage.png') })
})
