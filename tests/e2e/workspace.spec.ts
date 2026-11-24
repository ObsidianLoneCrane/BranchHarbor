import { expect, test } from '@playwright/test'

test('workspace navigation, theme persistence, and unavailable actions', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Overview')
  const accounts = page.getByRole('region', { name: 'Connected accounts' })
  await expect(accounts).toContainText(/GitHub.*Not connected/)
  await expect(accounts).toContainText(/Gitee.*Not connected/)
  await page.getByRole('link', { name: 'Repositories', exact: true }).click()
  await page.getByRole('button', { name: 'Add repository', exact: true }).click()
  await expect(page.getByRole('button', { name: 'New repository' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: 'Activity', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Activity')
  await page.goBack()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Repositories')
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page.getByText('Browser preview', { exact: true })).toBeVisible()
  await page.getByRole('radio', { name: 'Dark', exact: true }).check()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings')
  await expect(page.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked()
  await page.getByRole('radio', { name: 'Light', exact: true }).check()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(errors).toEqual([])
})

test('keyboard access and unknown route recovery', async ({ page }) => {
  await page.goto('/#/missing-page')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found')
  await page.getByRole('link', { name: 'Skip to content' }).focus()
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('main')).toBeFocused()
  await page.getByRole('link', { name: 'Back to Home' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Overview')
})

test('the language menu stays hidden until opened', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  const language = page.getByRole('combobox', { name: 'Language', exact: true })
  const options = language.locator('optgroup')
  await expect(language).toBeVisible()
  await expect(options).toBeHidden()

  await language.click()
  await expect(options).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(options).toBeHidden()
  await expect(language).toHaveValue('en')
})

for (const width of [375, 720, 1240]) {
  test(`views stay within a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 820 })
    for (const route of ['/', '/repositories', '/activity', '/settings']) {
      await page.goto(`/#${route}`)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
    }
  })
}
