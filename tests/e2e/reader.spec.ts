import { expect, test } from '@playwright/test'
import { installReaderFixture } from './reader-fixture'
const root = '/#/repositories/github:github.com:1/alice/workspace'

test('reads PR details and comments and restores the list filter and provider page', async ({
  page,
}) => {
  await installReaderFixture(page)
  await page.goto(root)
  await page
    .getByRole('navigation', { name: 'Repository navigation' })
    .getByRole('link', { name: 'Pull requests', exact: true })
    .click()
  await page.getByRole('combobox', { name: 'State', exact: true }).selectOption('closed')
  await page.getByRole('button', { name: 'Next discussion page' }).click()
  await page.getByRole('link', { name: 'Second provider page', exact: true }).click()
  await expect(page.getByRole('article', { name: 'Discussion detail' })).toContainText('#45')
  await expect(page.locator('.reader-branches')).toContainText(
    'contributor/workspace:feature/explorer',
  )
  await expect(page.locator('.reader-branches')).toContainText('alice/workspace:develop')
  await page.getByRole('button', { name: 'Next comments page' }).click()
  await expect(page.getByRole('region', { name: 'Discussion comments' })).toContainText(
    'Follow-up from page two.',
  )
  await expect(page.getByRole('region', { name: 'Discussion comments' })).toContainText(
    'Unknown author',
  )
  await page.getByRole('link', { name: 'Back to pull requests', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'State', exact: true })).toHaveValue('closed')
  await expect(page.getByRole('link', { name: 'Second provider page', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Pull requests', exact: true })).toContainText(
    'Page 2',
  )
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'State', exact: true })).toHaveValue('closed')
  await expect(page.getByRole('link', { name: 'Second provider page', exact: true })).toBeVisible()
})

test('keeps merged PRs distinct and supports Gitee issue identifiers and states', async ({
  page,
}) => {
  await installReaderFixture(page)
  await page.goto(`${root}/pulls`)
  await page.getByRole('combobox', { name: 'State', exact: true }).selectOption('merged')
  await page
    .getByRole('link', { name: 'Keep directory requests pinned to a commit', exact: true })
    .click()
  await expect(page.getByRole('article', { name: 'Discussion detail' })).toContainText('#44')
  await expect(page.locator('.work-state')).toHaveText('Merged')
  await page
    .getByRole('navigation', { name: 'Repository navigation' })
    .getByRole('link', { name: 'Issues', exact: true })
    .click()
  await expect(
    page.getByRole('link', { name: 'Handle an empty repository', exact: true }),
  ).toBeVisible()
  await page.goto('/#/repositories/gitee:gitee.com:10/jane/workspace/issues')
  await page.getByRole('combobox', { name: 'State', exact: true }).selectOption('progressing')
  await page.getByRole('link', { name: 'Handle an empty repository', exact: true }).click()
  await expect(page.getByRole('article', { name: 'Discussion detail' })).toContainText('#IKS135')
  await expect(page.locator('.work-state')).toHaveText('In progress')
  await expect(
    page.getByRole('heading', { name: 'Handle an empty repository', exact: true }),
  ).toBeVisible()
})

test('displays descriptions and comments as inert text without loading remote images', async ({
  page,
}) => {
  await installReaderFixture(page, { unsafe: true, truncated: true })
  const requests: string[] = []
  page.on('request', (request) => {
    if (request.url().startsWith('https://untrusted.invalid')) requests.push(request.url())
  })
  await page.goto(`${root}/pulls/42`)
  await expect(page.getByRole('article', { name: 'Discussion detail' })).toContainText('<img src=')
  await expect(page.getByRole('region', { name: 'Discussion comments' })).toContainText(
    '<script>window.readerExecuted=true</script>',
  )
  await expect(page.getByRole('article', { name: 'Discussion detail' })).toContainText(
    '64 KiB preview limit',
  )
  await expect(
    page.locator(
      '.discussion-detail img, .discussion-detail script, .discussion-comments img, .discussion-comments script',
    ),
  ).toHaveCount(0)
  expect(await page.evaluate(() => 'readerExecuted' in window)).toBe(false)
  expect(requests).toEqual([])
})

test('preserves filtered empty provider pages and allows continuing to matching issues', async ({
  page,
}) => {
  await installReaderFixture(page, { filteredPage: true })
  await page.goto(`${root}/issues`)
  await expect(
    page.getByRole('heading', { name: 'No issues on this page', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('This provider page includes entries excluded', { exact: false }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Next discussion page' }).click()
  await expect(page.getByRole('link', { name: 'Second provider page', exact: true })).toBeVisible()
})

test('retries comments independently while keeping the readable description', async ({ page }) => {
  await installReaderFixture(page, { commentsError: true })
  await page.goto(`${root}/pulls/42`)
  await expect(page.getByRole('article', { name: 'Discussion detail' })).toContainText(
    'Keep repository browsing focused',
  )
  await expect(
    page.getByRole('region', { name: 'Discussion comments' }).getByRole('alert'),
  ).toContainText('could not be reached')
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Discussion comments' })).toContainText(
    'regression test',
  )
  const detailCalls = await page.evaluate(
    () =>
      (window as unknown as { __readerCalls: { kind: string }[] }).__readerCalls.filter(
        (query) => query.kind === 'detail',
      ).length,
  )
  expect(detailCalls).toBe(1)
})

test('discards late PR lists and details when changing task or item', async ({ page }) => {
  await installReaderFixture(page, { slowList: true, slowDetail: true })
  await page.goto(`${root}/pulls`)
  await page
    .getByRole('navigation', { name: 'Repository navigation' })
    .getByRole('link', { name: 'Issues', exact: true })
    .click()
  await expect(
    page.getByRole('link', { name: 'Handle an empty repository', exact: true }),
  ).toBeVisible()
  await page.waitForTimeout(600)
  await expect(
    page.getByRole('link', { name: 'Improve branch browsing', exact: true }),
  ).toHaveCount(0)
  await page.evaluate(() => {
    location.hash = '/repositories/github:github.com:1/alice/workspace/pulls/42'
  })
  await expect(page.getByRole('status')).toContainText('Loading discussion')
  await page.evaluate(() => {
    location.hash = '/repositories/github:github.com:1/alice/workspace/pulls/43'
  })
  await expect(page.getByRole('article', { name: 'Discussion detail' })).toContainText('#43')
  await page.waitForTimeout(600)
  await expect(page.getByRole('article', { name: 'Discussion detail' })).not.toContainText('#42')
})

test('keeps rate-limit cooldowns and narrow discussion pages usable', async ({ page }) => {
  await installReaderFixture(page, { rateLimit: true })
  await page.setViewportSize({ width: 375, height: 820 })
  await page.goto(`${root}/pulls/42`)
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeEnabled({
    timeout: 5000,
  })
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Discussion comments' })).toContainText(
    'regression test',
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('distinguishes an empty list from an unavailable detail and offers recovery', async ({
  page,
}) => {
  await installReaderFixture(page, { empty: true, missing: true })
  await page.goto(`${root}/issues`)
  await expect(
    page.getByRole('heading', { name: 'No issues on this page', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next discussion page' })).toBeDisabled()
  await page.goto(`${root}/issues/7`)
  await expect(page.getByRole('alert')).toContainText('unavailable or not permitted')
  await expect(page.getByRole('article', { name: 'Discussion detail' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Back to issues', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'No issues on this page', exact: true }),
  ).toBeVisible()
})
