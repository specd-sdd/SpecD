import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ResolveBundle, createSkillRepository } from '../../src/index.js'

/**
 * Creates a temporary directory for test I/O.
 *
 * @returns Absolute temp directory path.
 */
async function setupTempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'specd-skills-bundle-'))
}

describe('SkillBundle', () => {
  it('given a resolved bundle, when install is called, then files are written to target dir', async () => {
    const repository = createSkillRepository()
    const { bundle } = await new ResolveBundle(repository).execute({ name: 'specd' })

    const tempDir = await setupTempDir()
    const outputDir = path.join(tempDir, 'install')

    try {
      await bundle.install(outputDir)
      const installedPath = path.join(outputDir, 'SKILL.md')
      const installed = await readFile(installedPath, 'utf8')

      expect(installed.length).toBeGreaterThan(0)
      expect(installed).not.toContain('allowed-tools:')
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('given installed files, when uninstall is called twice, then uninstall is idempotent', async () => {
    const repository = createSkillRepository()
    const bundle = await repository.getBundle('specd')

    const tempDir = await setupTempDir()
    const outputDir = path.join(tempDir, 'install')

    try {
      await bundle.install(outputDir)
      await bundle.uninstall(outputDir)
      await bundle.uninstall(outputDir)

      const installedPath = path.join(outputDir, 'SKILL.md')
      await expect(stat(installedPath)).rejects.toThrow()
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
