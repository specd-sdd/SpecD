import { test, expect } from '@playwright/test'

async function openStudioShell(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  const shell = page.getByTestId('studio-shell')
  const connectHeading = page.getByRole('heading', { name: 'Connect to SpecD API' })

  // ui serve auto-connects on same origin; manual gate otherwise
  await expect(shell.or(connectHeading)).toBeVisible({ timeout: 25_000 })

  if (await shell.isVisible()) {
    return
  }

  await page.getByRole('button', { name: 'Test connection' }).click()
  await expect(page.getByText(/Project:/)).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Open Studio' }).click()
  await expect(shell).toBeVisible({ timeout: 15_000 })
}

test.describe('SpecD Studio UI', () => {
  test('loads studio title', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveTitle(/SpecD Studio/)
  })

  test('user can open the studio shell', async ({ page }) => {
    await openStudioShell(page)
    await expect(page.getByTestId('studio-shell')).toBeVisible()
    await expect(page.locator('.studio-panel-header', { hasText: /^Changes$/ })).toBeVisible()
    await expect(page.locator('.studio-panel-header', { hasText: /^Workspaces$/ })).toBeVisible()
  })

  test('validate all shows drift warning and cancel keeps dialog closed', async ({ page }) => {
    await openStudioShell(page)

    const activeChanges = page.locator('[data-testid^="studio-active-change-"]')
    try {
      await activeChanges.first().waitFor({ state: 'visible', timeout: 15_000 })
    } catch {
      test.skip(true, 'No active changes in project')
    }

    await activeChanges.first().click()
    await expect(page.getByRole('button', { name: 'Overview' })).toBeVisible({
      timeout: 12_000,
    })

    await page.getByRole('button', { name: 'Artifacts' }).click()
    await expect(page.getByTestId('studio-artifacts-tab')).toBeVisible({ timeout: 5_000 })
    await page.getByTestId('studio-validate-all').click()
    const dialog = page.getByTestId('studio-validate-confirm-dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await expect(dialog.getByText(/invalidate|drift/i)).toBeVisible()

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).not.toBeVisible()
  })

  test('selecting a change shows the overview', async ({ page }) => {
    await openStudioShell(page)

    const activeChanges = page.locator('[data-testid^="studio-active-change-"]')
    try {
      await activeChanges.first().waitFor({ state: 'visible', timeout: 15_000 })
    } catch {
      test.skip(true, 'No active changes in project')
    }

    const changeButton = activeChanges.first()
    const testId = await changeButton.getAttribute('data-testid')
    const changeName = testId?.replace(/^studio-active-change-/, '')
    test.skip(!changeName, 'Change name not found')

    await changeButton.click()
    await expect(page.getByRole('button', { name: 'Overview' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: changeName! })).toBeVisible({
      timeout: 12_000,
    })
  })
})
