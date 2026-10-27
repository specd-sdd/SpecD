import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildGraphInputVisibilitySnapshot } from '../../../src/application/services/graph-input-visibility.js'
import { type WorkspaceIndexTarget } from '../../../src/domain/value-objects/index-options.js'

describe('buildGraphInputVisibilitySnapshot', () => {
  let projectDir: string
  let workspaceDir: string

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'specd-visibility-test-'))
    workspaceDir = join(projectDir, 'packages', 'app')
    const fs = join(workspaceDir, 'src')
    mkdirSync(fs, { recursive: true })
  })

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true })
  })

  it('excludes oversized non-exempt files from currentInputs and visibility while including exempt and within-limit files', () => {
    const normalPath = join(workspaceDir, 'src', 'normal.ts')
    const oversizedPath = join(workspaceDir, 'src', 'oversized.ts')
    const exemptPath = join(workspaceDir, 'src', 'exempt.ts')

    // Normal: 50 bytes
    writeFileSync(normalPath, 'export const a = 1;'.padEnd(50, ' '))
    // Oversized: 500 bytes
    writeFileSync(oversizedPath, 'export const b = 2;'.padEnd(500, ' '))
    // Exempt oversized: 500 bytes
    writeFileSync(exemptPath, 'export const c = 3;'.padEnd(500, ' '))

    const workspace: WorkspaceIndexTarget = {
      name: 'app',
      prefix: null,
      codeRoot: workspaceDir,
      ownership: 'owned',
      isExternal: false,
      specRepo: {
        specsPath: undefined,
        loadAll: () => [],
        load: () => undefined,
        find: () => [],
      } as unknown as WorkspaceIndexTarget['specRepo'],
    }

    const snapshot = buildGraphInputVisibilitySnapshot(
      projectDir,
      [workspace],
      {
        maxFileBytes: 100, // 100 bytes limit
        largeFilePaths: ['packages/app/src/exempt.ts'], // Exemption
      },
      null,
      [],
    )

    const wsInputs = snapshot.currentInputs.get('app')
    expect(wsInputs).toBeDefined()

    // Within-limit file is visible
    expect(wsInputs?.has('packages/app/src/normal.ts')).toBe(true)
    expect(snapshot.isVisible('app', 'packages/app/src/normal.ts')).toBe(true)

    // Exempt oversized file is visible
    expect(wsInputs?.has('packages/app/src/exempt.ts')).toBe(true)
    expect(snapshot.isVisible('app', 'packages/app/src/exempt.ts')).toBe(true)

    // Oversized non-exempt file is NOT visible
    expect(wsInputs?.has('packages/app/src/oversized.ts')).toBe(false)
    expect(snapshot.isVisible('app', 'packages/app/src/oversized.ts')).toBe(false)
  })
})
