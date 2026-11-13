import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { NodeWorkspaceAccessibilitySource } from '../../../src/infrastructure/fs/node-workspace-accessibility-source.js'

describe('NodeWorkspaceAccessibilitySource', () => {
  let root = ''

  afterEach(() => {
    if (root !== '') rmSync(root, { recursive: true, force: true })
  })

  it('given an existing directory, when checked, then returns true', async () => {
    root = mkdtempSync(join(tmpdir(), 'specd-access-source-'))
    const source = new NodeWorkspaceAccessibilitySource()
    const result = await source.isAccessibleDirectory(root)
    expect(result).toBe(true)
  })

  it('given a regular file, when checked, then returns false', async () => {
    root = mkdtempSync(join(tmpdir(), 'specd-access-source-'))
    const file = join(root, 'not-a-dir.txt')
    writeFileSync(file, 'hello')
    const source = new NodeWorkspaceAccessibilitySource()
    const result = await source.isAccessibleDirectory(file)
    expect(result).toBe(false)
  })

  it('given a missing path, when checked, then returns false', async () => {
    root = mkdtempSync(join(tmpdir(), 'specd-access-source-'))
    const missing = join(root, 'non-existent')
    const source = new NodeWorkspaceAccessibilitySource()
    const result = await source.isAccessibleDirectory(missing)
    expect(result).toBe(false)
  })
})
