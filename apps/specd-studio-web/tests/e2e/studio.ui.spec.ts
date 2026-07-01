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

type SidebarChangeTarget = {
  readonly name: string
  readonly testIdPrefix: 'studio-active-change' | 'studio-draft-change'
}

function changeNameFromTestId(
  testId: string | null,
  testIdPrefix: SidebarChangeTarget['testIdPrefix'],
): string | undefined {
  if (!testId) {
    return undefined
  }
  const prefix = `${testIdPrefix}-`
  return testId.startsWith(prefix) ? testId.slice(prefix.length) : undefined
}

async function requireTwoSidebarChanges(
  page: import('@playwright/test').Page,
): Promise<readonly [SidebarChangeTarget, SidebarChangeTarget]> {
  await openStudioShell(page)

  await expect(page.locator('.studio-panel-header', { hasText: /^Changes$/ })).toBeVisible()

  await expect(async () => {
    const activeCount = await page.locator('[data-testid^="studio-active-change-"]').count()
    const draftCount = await page.locator('[data-testid^="studio-draft-change-"]').count()
    if (activeCount + draftCount < 2) {
      throw new Error('Waiting for sidebar changes to load')
    }
  }).toPass({ timeout: 20_000 })

  const activeRows = page.locator('[data-testid^="studio-active-change-"]')
  const draftRows = page.locator('[data-testid^="studio-draft-change-"]')
  const activeCount = await activeRows.count()
  const draftCount = await draftRows.count()

  if (activeCount >= 2) {
    const firstName = changeNameFromTestId(
      await activeRows.nth(0).getAttribute('data-testid'),
      'studio-active-change',
    )
    const secondName = changeNameFromTestId(
      await activeRows.nth(1).getAttribute('data-testid'),
      'studio-active-change',
    )
    if (firstName && secondName) {
      return [
        { name: firstName, testIdPrefix: 'studio-active-change' },
        { name: secondName, testIdPrefix: 'studio-active-change' },
      ]
    }
  }

  if (draftCount >= 2) {
    const firstName = changeNameFromTestId(
      await draftRows.nth(0).getAttribute('data-testid'),
      'studio-draft-change',
    )
    const secondName = changeNameFromTestId(
      await draftRows.nth(1).getAttribute('data-testid'),
      'studio-draft-change',
    )
    if (firstName && secondName) {
      return [
        { name: firstName, testIdPrefix: 'studio-draft-change' },
        { name: secondName, testIdPrefix: 'studio-draft-change' },
      ]
    }
  }

  if (activeCount >= 1 && draftCount >= 1) {
    const activeName = changeNameFromTestId(
      await activeRows.first().getAttribute('data-testid'),
      'studio-active-change',
    )
    const draftName = changeNameFromTestId(
      await draftRows.first().getAttribute('data-testid'),
      'studio-draft-change',
    )
    if (activeName && draftName) {
      return [
        { name: activeName, testIdPrefix: 'studio-active-change' },
        { name: draftName, testIdPrefix: 'studio-draft-change' },
      ]
    }
  }

  test.skip(true, 'Need at least two sidebar changes (active and/or draft)')
  throw new Error('Need at least two sidebar changes (active and/or draft)')
}

async function openSidebarChange(
  page: import('@playwright/test').Page,
  target: SidebarChangeTarget,
): Promise<void> {
  await page.getByTestId(`${target.testIdPrefix}-${target.name}`).click()
  await expect(page.getByRole('heading', { level: 1, name: target.name })).toBeVisible({
    timeout: 12_000,
  })
  await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible({ timeout: 12_000 })
}

async function expectWorkflowStatusAvailable(page: import('@playwright/test').Page): Promise<void> {
  const panel = page.getByTestId('studio-change-workflow-status')
  await expect(panel).toBeVisible({ timeout: 12_000 })
  await expect(panel.getByText('Workflow status unavailable.')).not.toBeVisible()
  await expect(panel.getByText('Next action')).toBeVisible({ timeout: 12_000 })
}

test.describe('SpecD Studio UI', () => {
  test('loads studio title', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveTitle(/SpecD Studio/)
  })

  test('user can open the studio shell', async ({ page }) => {
    await openStudioShell(page)
    await expect(page.getByTestId('studio-shell')).toBeVisible()
    await expect(page.getByTestId('studio-titlebar')).toBeVisible()
    await expect(page.getByTestId('studio-primary-sidebar')).toBeVisible()
    await expect(page.getByTestId('studio-activity-rail-changes')).toBeVisible()
    await expect(page.locator('.studio-panel-header', { hasText: /^Changes$/ })).toBeVisible()

    await page.getByTestId('studio-activity-rail-workspaces').click()
    await expect(page.getByTestId('studio-workspaces-hub')).toBeVisible()
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

  test('switching between changes keeps workflow status on overview', async ({ page }) => {
    const [first, second] = await requireTwoSidebarChanges(page)

    await openSidebarChange(page, first)
    await expectWorkflowStatusAvailable(page)

    await openSidebarChange(page, second)
    await expectWorkflowStatusAvailable(page)

    await openSidebarChange(page, first)
    await expectWorkflowStatusAvailable(page)
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

  test('workflow status stays available across status poll ticks', async ({ page }) => {
    await openFirstActiveChange(page)
    await expectWorkflowStatusAvailable(page)

    await page.waitForTimeout(3_500)
    await expectWorkflowStatusAvailable(page)
  })

  test('archive sidebar opens a read-only archived change', async ({ page }) => {
    await openStudioShell(page)

    const archivedRows = page.locator('[data-testid^="studio-archived-change-"]')
    try {
      await archivedRows.first().waitFor({ state: 'visible', timeout: 15_000 })
    } catch {
      test.skip(true, 'No archived changes in project')
    }

    const testId = await archivedRows.first().getAttribute('data-testid')
    const archivedName = testId?.replace(/^studio-archived-change-/, '')
    test.skip(!archivedName, 'Archived change name not found')

    await archivedRows.first().click()
    await expect(page.getByRole('heading', { level: 1, name: archivedName! })).toBeVisible({
      timeout: 12_000,
    })
    await expect(page.getByText('Read-only archived snapshot')).toBeVisible({ timeout: 12_000 })
  })

  test('command palette graph search can render result snippets', async ({ page }) => {
    await openStudioShell(page)

    await page.getByTestId('studio-open-command-palette').click()
    const input = page.getByTestId('studio-command-palette-input')
    await expect(input).toBeVisible()

    await input.fill('architecture')
    await expect(page.getByTestId('studio-command-palette-specs')).toBeVisible({ timeout: 12_000 })

    const snippetBlocks = page.getByTestId('studio-command-palette-list').locator('pre')
    await expect(async () => {
      const count = await snippetBlocks.count()
      if (count === 0) {
        throw new Error('Waiting for graph search snippets')
      }
    }).toPass({ timeout: 12_000 })
    await expect(snippetBlocks.first()).not.toBeEmpty()
  })
})
