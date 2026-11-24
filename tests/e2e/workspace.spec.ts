import { expect, test } from '@playwright/test'

test('workspace navigation, theme persistence, and unavailable actions', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Overview')
  await expect(page.getByRole('group', { name: 'Window controls' })).toHaveCount(0)
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

test('themes the Windows title bar, keeps it above scrolling, and sends window actions', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let maximized = false
    const calls: string[] = []
    Object.defineProperty(window, 'windowActionCalls', { value: calls })
    Object.defineProperty(window, 'isTauri', { value: true })
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {
        metadata: { currentWindow: { label: 'main' } },
        async invoke(command: string) {
          if (command === 'list_accounts') return []
          if (command === 'list_local_repositories' || command === 'list_repository_links')
            return []
          if (command === 'read_recent_local_activity') return { commits: [] }
          if (command === 'get_runtime_info')
            return { version: '0.1.0', platform: 'windows', architecture: 'x86_64' }
          if (command === 'get_storage_info') return { path: 'C:/Fixture', databaseBytes: 0 }
          if (command === 'cache_storage') return 0
          if (command === 'plugin:window|is_decorated') return false
          if (command === 'plugin:window|is_maximized') return maximized
          if (command === 'plugin:window|toggle_maximize') maximized = !maximized
          calls.push(command)
        },
      },
    })
  })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  const controls = page.getByRole('group', { name: 'Window controls' })
  await expect(controls).toBeVisible()
  const titleBar = page.locator('.window-titlebar')
  await expect(titleBar).toHaveCSS('background-color', 'rgb(23, 30, 37)')
  expect(await titleBar.evaluate((bar) => getComputedStyle(bar).fontFamily)).toBe(
    await page.locator('main').evaluate((main) => getComputedStyle(main).fontFamily),
  )
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(titleBar).toHaveCSS('background-color', 'rgb(244, 246, 247)')
  await page.getByRole('button', { name: 'Switch to dark theme' }).click()
  await expect(titleBar).toHaveCSS('background-color', 'rgb(23, 30, 37)')
  await page.reload()
  await expect(titleBar).toHaveCSS('background-color', 'rgb(23, 30, 37)')
  await page.setViewportSize({ width: 900, height: 560 })
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
  const scrollArea = page.locator('.workspace-scroll')
  const titleBounds = (await titleBar.boundingBox())!
  const scrollBounds = (await scrollArea.boundingBox())!
  expect(titleBounds.width).toBe(900)
  const headerBounds = (await page.locator('.app-header').boundingBox())!
  expect(scrollBounds.y).toBe(headerBounds.y + headerBounds.height)
  expect(scrollBounds.y).toBeGreaterThan(titleBounds.y + titleBounds.height)
  await page.mouse.move(800, 460)
  await page.mouse.wheel(0, 180)
  const scrollTop = () => scrollArea.evaluate((area) => area.scrollTop)
  await expect.poll(scrollTop).toBeGreaterThan(0)
  expect(await titleBar.boundingBox()).toEqual(titleBounds)
  expect(await page.evaluate(() => document.scrollingElement?.scrollTop)).toBe(0)
  const settingsPosition = await scrollTop()
  await page.getByRole('link', { name: 'Home', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible()
  expect(await scrollTop()).toBe(0)
  await page.goBack()
  await expect.poll(scrollTop).toBe(settingsPosition)
  await controls.getByRole('button', { name: 'Minimize' }).click()
  await controls.getByRole('button', { name: 'Maximize' }).click()
  await controls.getByRole('button', { name: 'Restore window' }).click()
  await expect(controls.getByRole('button', { name: 'Maximize' })).toBeVisible()
  await controls.getByRole('button', { name: 'Close window' }).click()
  expect(await page.evaluate(() => Reflect.get(window, 'windowActionCalls'))).toEqual([
    'plugin:window|minimize',
    'plugin:window|toggle_maximize',
    'plugin:window|toggle_maximize',
    'plugin:window|close',
  ])
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
