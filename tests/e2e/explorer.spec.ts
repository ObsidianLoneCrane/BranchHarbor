import { expect, test } from '@playwright/test'
import { installExplorerFixture } from './explorer-fixture'

const route = '/#/repositories/github:github.com:1/alice/workspace'
test('opens repository files, navigates directories, and restores repository list pagination', async ({
  page,
}) => {
  await installExplorerFixture(page)
  await page.goto('/#/repositories')
  await page
    .getByRole('combobox', { name: 'Account', exact: true })
    .selectOption('github:github.com:1')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('link', { name: 'alice/second-project', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('alice/second-project')
  await expect(
    page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Repositories', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
  await page.getByRole('button', { name: 'README.md File', exact: true }).click()
  await expect(page.getByRole('region', { name: 'File source' })).toContainText(
    'pinned main commit',
  )
  await page.getByRole('button', { name: 'src Directory', exact: true }).click()
  await page.getByRole('button', { name: 'main.ts File', exact: true }).click()
  await expect(page.getByRole('region', { name: 'File source' })).toContainText(
    'Hello, BranchHarbor',
  )
  await expect(page.locator('.hljs-keyword').first()).toBeVisible()
  await page.getByRole('button', { name: 'Parent directory', exact: true }).click()
  await expect(page.getByRole('button', { name: 'README.md File', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Back to repositories', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'alice/second-project', exact: true }),
  ).toBeVisible()
  await expect(page.getByText('Page 2', { exact: false })).toBeVisible()
})

test('selects slash branches, ignores stale results, and paginates branch choices', async ({
  page,
}) => {
  await installExplorerFixture(page, { slowBranch: true })
  await page.goto(route)
  await expect(page.getByText('Commit aaaaaaaa', { exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'Branch', exact: true }).selectOption('feature/preview')
  await page.getByRole('combobox', { name: 'Branch', exact: true }).selectOption('main')
  await expect(page.getByText('Commit aaaaaaaa', { exact: true })).toBeVisible()
  await page.waitForTimeout(600)
  await expect(page.getByText('Commit dddddddd', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Next branch page' }).click()
  await expect(
    page
      .getByRole('combobox', { name: 'Branch', exact: true })
      .getByRole('option', { name: 'main (selected)', exact: true }),
  ).toBeAttached()
  await page.getByRole('combobox', { name: 'Branch', exact: true }).selectOption('release')
  await expect(page.getByText('Commit dddddddd', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'README.md File', exact: true }).click()
  await expect(page.getByRole('region', { name: 'File source' })).toContainText('Feature preview')
})

test('shows safe source and clear binary, size, encoding, symlink, and submodule states', async ({
  page,
}) => {
  await installExplorerFixture(page)
  await page.goto(route)
  await page.getByRole('button', { name: 'unsafe.html File', exact: true }).click()
  const source = page.getByRole('region', { name: 'File source' })
  await expect(source).toContainText('<script>window.previewExecuted=true</script>')
  await expect(page.locator('.file-pane img, .file-pane script')).toHaveCount(0)
  expect(await page.evaluate(() => 'previewExecuted' in window)).toBe(false)
  for (const [name, message] of [
    ['logo.png File', 'Binary file.'],
    ['large.dat File', '256 KiB'],
    ['legacy.txt File', 'not supported UTF-8'],
    ['link Symbolic link', 'target is not followed'],
    ['vendor Submodule', 'Git submodule.'],
    ['empty.txt File', 'This file is empty.'],
  ]) {
    await page.getByRole('button', { name, exact: true }).click()
    await expect(page.locator('.file-pane')).toContainText(message!)
  }
})

test('supports Gitee targets, retryable file errors, and truncated directory notices', async ({
  page,
}) => {
  await installExplorerFixture(page, { fileError: true, truncated: true })
  await page.goto('/#/repositories/gitee:gitee.com:10/jane/workspace')
  await expect(page.locator('.explorer-account')).toContainText('Gitee · @jane')
  await expect(page.getByRole('status')).toContainText('truncated')
  await page.getByRole('button', { name: 'README.md File', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('unavailable or not permitted')
  await expect(page.getByRole('alert')).not.toContainText('Sensitive')
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByRole('region', { name: 'File source' })).toContainText('Workspace')
})

test('handles empty repositories and missing branches without showing old source', async ({
  page,
}) => {
  await installExplorerFixture(page, { missingBranch: true })
  await page.goto(route)
  await page.getByRole('button', { name: 'README.md File', exact: true }).click()
  await page.getByRole('combobox', { name: 'Branch', exact: true }).selectOption('feature/preview')
  await expect(page.getByRole('alert')).toContainText('unavailable')
  await expect(page.getByRole('region', { name: 'File source' })).toHaveCount(0)
  await page.getByRole('combobox', { name: 'Branch', exact: true }).selectOption('main')
  await expect(page.getByRole('button', { name: 'src Directory', exact: true })).toBeVisible()
  const empty = await page.context().newPage()
  await installExplorerFixture(empty, { empty: true })
  await empty.goto(route)
  await expect(empty.getByRole('heading', { name: 'No branches yet' })).toBeVisible()
  await empty.close()
})

test('honors explorer cooldown and stays within a narrow viewport', async ({ page }) => {
  await installExplorerFixture(page, { rateLimit: true })
  await page.setViewportSize({ width: 375, height: 820 })
  await page.goto(route)
  await page.getByRole('button', { name: 'README.md File', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeEnabled({
    timeout: 5000,
  })
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByRole('region', { name: 'File source' })).toContainText('Workspace')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
