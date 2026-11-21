import { expect, test } from '@playwright/test'

test('imports a working tree, commits staged changes, and pushes to an explicit target', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const repository = { id: 1, path: 'C:\\Projects\\Example project' }
    const url = 'https://github.com/example/project.git'
    let imported = false
    let pickerOpened = false
    let index = '?'
    let head: string | null = null
    let upstream: string | null = null
    Object.defineProperty(window, 'isTauri', { value: true })
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {
        async invoke(command: string, args: Record<string, unknown> = {}) {
          if (command === 'list_accounts') return []
          if (command === 'list_local_repositories') return imported ? [repository] : []
          if (command === 'pick_repository_folder') {
            if (pickerOpened) return repository.path
            pickerOpened = true
            return null
          }
          if (command === 'add_local_repository') {
            const request = args.request as { kind: string; path: string }
            if (request.kind !== 'import' || request.path !== repository.path) throw 'invalidInput'
            imported = true
            return repository
          }
          if (!imported || args.id !== repository.id) throw 'notRegistered'
          if (command === 'read_local_repository') {
            return {
              branch: 'main',
              head,
              upstream,
              ahead: upstream ? 0 : null,
              behind: upstream ? 0 : null,
              branches: head ? ['main'] : [],
              author: 'Example Author <author@example.invalid>',
              changes: head
                ? []
                : [{ path: 'file.txt', index, worktree: index === '?' ? '?' : ' ' }],
              remotes: [{ name: 'shared', fetchUrl: url, pushUrl: url }],
            }
          }
          if (command === 'read_local_diff' && args.path === 'file.txt') {
            return { text: '+Example content', truncated: false }
          }
          if (command === 'change_local_repository') {
            const operation = args.operation as Record<string, unknown>
            if (operation.kind === 'stage' && operation.path === 'file.txt') {
              index = 'A'
              return
            }
            if (
              operation.kind === 'commit' &&
              index === 'A' &&
              operation.message === 'Add file' &&
              operation.author === 'Example Author <author@example.invalid>'
            ) {
              head = 'abc1234'
              return
            }
            if (
              operation.kind === 'push' &&
              operation.remote === 'shared' &&
              operation.url === url &&
              operation.localBranch === 'main' &&
              operation.branch === 'published' &&
              operation.track
            ) {
              upstream = 'shared/published'
              return
            }
          }
          throw 'invalidInput'
        },
      },
    })
  })

  await page.goto('/#/repositories')
  await page.getByRole('button', { name: 'Import repository' }).click()
  await expect(page.getByText('No local repositories yet.')).toBeVisible()
  await page.getByRole('button', { name: 'Import repository' }).click()
  await expect(page.getByRole('heading', { name: 'Example project' })).toBeVisible()
  const separator = page.getByRole('separator', { name: 'Resize list' })
  await separator.focus()
  await separator.press('ArrowRight')
  await expect(separator).toHaveAttribute('aria-valuenow', '35')
  await page.setViewportSize({ width: 720, height: 560 })
  await expect(separator).toBeHidden()
  await page.getByRole('button', { name: 'View diff · file.txt' }).click()
  await expect(page.getByText('+Example content')).toBeVisible()
  const back = page.getByRole('button', { name: 'Back to changes' })
  await expect(back).toBeFocused()
  await expect(page.getByRole('button', { name: 'Stage', exact: true })).toBeHidden()
  await back.click()
  await expect(page.getByRole('button', { name: 'View diff · file.txt' })).toBeFocused()
  await page.getByRole('button', { name: 'Stage', exact: true }).click()
  await page.getByRole('button', { name: 'Prepare commit' }).click()
  await page.getByLabel('Commit message').fill('Add file')
  await page.getByRole('button', { name: 'Commit staged changes' }).click()
  await expect(page.getByText('Working tree is clean.')).toBeVisible()
  await page.getByRole('link', { name: 'Remotes', exact: true }).click()
  await page.getByRole('button', { name: 'Synchronize', exact: true }).click()
  await page.getByLabel('Target remote').selectOption('shared')
  await expect(page.getByRole('button', { name: 'Push', exact: true })).toBeDisabled()
  await page.getByLabel('Remote branch').fill('published')
  await page.getByLabel('Set upstream after push').check()
  await page.getByRole('button', { name: 'Push', exact: true }).click()
  await expect(page.getByText('Push completed.')).toBeVisible()
  await page.getByRole('link', { name: 'Branches', exact: true }).click()
  await expect(page.getByText('shared/published', { exact: true })).toBeVisible()
})
