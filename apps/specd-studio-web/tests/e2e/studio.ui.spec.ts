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

async function openFirstActiveChange(page: import('@playwright/test').Page): Promise<string> {
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
  await expect(page.getByRole('heading', { level: 1, name: changeName! })).toBeVisible({
    timeout: 12_000,
  })
  await expect(page.getByRole('button', { name: 'Edit Change' })).toBeVisible({
    timeout: 12_000,
  })

  return changeName!
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
    await expect(page.locator('.studio-panel-header', { hasText: /^Workspaces/ })).toBeVisible()
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
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible({
      timeout: 12_000,
    })

    await page.getByRole('tab', { name: 'Artifacts' }).click()
    await expect(page.getByTestId('studio-artifacts-tab')).toBeVisible({ timeout: 5_000 })
    await page.getByTestId('studio-validate-all').click()
    const dialog = page.getByTestId('studio-validate-confirm-dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await expect(dialog.getByText(/invalidate|drift/i)).toBeVisible()

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).not.toBeVisible()
  })

  test('selecting a change shows the overview', async ({ page }) => {
    await openFirstActiveChange(page)
  })

  test('command palette shows remote result categories', async ({ page }) => {
    await openStudioShell(page)

    await page.getByTestId('studio-open-command-palette').click()
    await expect(page.getByTestId('studio-command-palette-input')).toBeVisible()

    await page.getByTestId('studio-command-palette-input').fill('architecture')

    await expect(page.getByTestId('studio-command-palette-specs')).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByTestId('studio-command-palette-symbols')).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByTestId('studio-command-palette-documents')).toBeVisible({
      timeout: 10_000,
    })
  })

  test('new change dialog supports remote spec and dependency search without saving', async ({
    page,
  }) => {
    await openStudioShell(page)

    await page.getByTestId('studio-new-change').click()
    const dialog = page.getByTestId('studio-change-scope-dialog')
    await expect(dialog).toBeVisible()

    await page.getByTestId('studio-change-scope-add-specs-input').fill('architecture')
    await expect(
      page.getByTestId('studio-change-scope-add-specs-item-default-global-architecture'),
    ).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('studio-change-scope-add-specs-item-default-global-architecture').click()
    await page.keyboard.press('Tab')
    await page.getByTestId('studio-change-scope-add-specs-button').click()

    const architectureCard = page.locator(
      '[data-testid="studio-change-scope-spec-card-default:_global/architecture"]',
    )
    await expect(architectureCard).toBeVisible()

    await page
      .getByTestId('studio-change-scope-add-deps-default-global-architecture-input')
      .fill('docs')
    await expect(
      page.getByTestId(
        'studio-change-scope-add-deps-default-global-architecture-item-default-global-docs',
      ),
    ).toBeVisible({ timeout: 10_000 })
    await page
      .getByTestId(
        'studio-change-scope-add-deps-default-global-architecture-item-default-global-docs',
      )
      .click()

    await page.keyboard.press('Tab')
    await page
      .getByTestId('studio-change-scope-add-deps-default-global-architecture-button')
      .click()
    await expect(architectureCard.getByText('default:_global/docs')).toBeVisible()

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).not.toBeVisible()
  })

  test('editing a selected change opens the scope dialog', async ({ page }) => {
    const changeName = await openFirstActiveChange(page)

    await page.getByRole('button', { name: 'Edit Change' }).click()
    const dialog = page.getByTestId('studio-change-scope-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(`Edit change: ${changeName}`)).toBeVisible()
    await expect(page.getByTestId('studio-change-scope-spec-cards')).toBeVisible()

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).not.toBeVisible()
  })
})
