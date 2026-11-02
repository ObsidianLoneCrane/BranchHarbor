import { expect, test } from '@playwright/test'
import { installAccountFixture } from './account-fixture'

test('connects two platforms, paginates repositories, restores metadata, and disconnects safely', async ({
  page,
}) => {
  await installAccountFixture(page)
  await page.goto('/#/settings')
  await page.getByRole('button', { name: 'Add account to GitHub', exact: true }).click()
  await page.getByLabel('Personal access token', { exact: true }).fill('invalid-fixture')
  await page.getByRole('button', { name: 'Verify and connect' }).click()
  await expect(page.getByRole('dialog')).toContainText('invalid or expired')
  await expect(page.getByLabel('Personal access token', { exact: true })).toHaveValue('')
  await page.getByLabel('Personal access token', { exact: true }).fill('synthetic-github-token')
  await page.getByRole('button', { name: 'Verify and connect' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.locator('.saved-account')).toContainText('@alice')
  await page.getByRole('button', { name: 'Add account to Gitee', exact: true }).click()
  await page.getByLabel('Personal access token', { exact: true }).fill('synthetic-gitee-token')
  await page.getByRole('button', { name: 'Verify and connect' }).click()
  await expect(page.locator('.saved-account')).toHaveCount(2)
  const saved = await page.evaluate(() => JSON.stringify(localStorage))
  expect(saved).not.toContain('synthetic-github-token')
  expect(saved).not.toContain('synthetic-gitee-token')
  await page.getByRole('link', { name: 'Repositories', exact: true }).click()
  await page
    .getByRole('combobox', { name: 'Account', exact: true })
    .selectOption('github:github.com:1')
  await expect(page.getByRole('heading', { name: 'alice/workspace' })).toBeVisible()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'alice/second-project' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
  await page.getByRole('combobox', { name: 'Visibility', exact: true }).selectOption('private')
  await expect(page.getByRole('heading', { name: 'alice/private-project' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Platform', exact: true }).selectOption('gitee')
  await expect(page.getByRole('heading', { name: 'jane/private-project' })).toBeVisible()
  await expect(page.getByText('alice/private-project', { exact: true })).toHaveCount(0)
  await page.reload()
  await expect(
    page.getByRole('combobox', { name: 'Account', exact: true }).locator('option'),
  ).toHaveCount(2)
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Disconnect alice', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.locator('.saved-account')).toHaveCount(2)
  await page.getByRole('button', { name: 'Disconnect alice', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm disconnect' }).click()
  await expect(page.locator('.saved-account')).toHaveCount(1)
  await expect(page.locator('.saved-account')).toContainText('@jane')
})

test('ignores stale repository responses after switching accounts', async ({ page }) => {
  await installAccountFixture(page, { initial: true, slowGithub: true })
  await page.goto('/#/settings')
  await page.getByRole('button', { name: 'Add account to Gitee', exact: true }).click()
  await page.getByLabel('Personal access token', { exact: true }).fill('synthetic-token')
  await page.getByRole('button', { name: 'Verify and connect' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.getByRole('link', { name: 'Repositories', exact: true }).click()
  await page
    .getByRole('combobox', { name: 'Account', exact: true })
    .selectOption('github:github.com:1')
  await expect(page.getByRole('status')).toContainText('Loading repositories')
  await page
    .getByRole('combobox', { name: 'Account', exact: true })
    .selectOption('gitee:gitee.com:10')
  await expect(page.getByRole('heading', { name: 'jane/workspace' })).toBeVisible()
  await page.waitForTimeout(500)
  await expect(page.getByRole('heading', { name: 'jane/workspace' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'alice/workspace' })).toHaveCount(0)
})

test('honors a rate-limit cooldown before repository retries', async ({ page }) => {
  await installAccountFixture(page, { initial: true, rateLimit: true })
  await page.goto('/#/repositories')
  await expect(page.getByRole('alert')).toContainText('rate limit')
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeEnabled({
    timeout: 5000,
  })
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'alice/workspace' })).toBeVisible()
})

test('connected repository layout fits a narrow viewport', async ({ page }) => {
  await installAccountFixture(page, { initial: true })
  await page.setViewportSize({ width: 375, height: 820 })
  await page.goto('/#/repositories')
  await expect(page.getByRole('heading', { name: 'alice/workspace' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Add account to Gitee', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('returning to a rate-limited account never displays another account repositories', async ({
  page,
}) => {
  await installAccountFixture(page, {
    initial: true,
    secondAccount: true,
    rateLimit: true,
    rateSeconds: 30,
  })
  await page.goto('/#/repositories')
  await expect(page.getByRole('alert')).toContainText('rate limit')
  await page
    .getByRole('combobox', { name: 'Account', exact: true })
    .selectOption('gitee:gitee.com:10')
  await expect(page.getByRole('heading', { name: 'jane/workspace' })).toBeVisible()
  await page
    .getByRole('combobox', { name: 'Account', exact: true })
    .selectOption('github:github.com:1')
  await expect(page.getByRole('alert')).toContainText('rate limit')
  await expect(page.getByRole('heading', { name: 'jane/workspace' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeDisabled()
})
