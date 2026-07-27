import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mergeJsonConfig, unmergeJsonConfig } from '../../src/application/json-config-manager.js'

describe('json-config-manager', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = path.join(
      os.tmpdir(),
      `specd-json-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    await mkdir(tempDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  describe('mergeJsonConfig', () => {
    it('given non-existent file, when merged, then creates file and parent dirs with formatted JSON', async () => {
      const targetFile = path.join(tempDir, '.claude', 'settings.json')

      await mergeJsonConfig<{ hooks?: Record<string, unknown> }>(targetFile, (cfg) => ({
        ...cfg,
        hooks: { SessionStart: [{ command: 'specd' }] },
      }))

      const content = await readFile(targetFile, 'utf8')
      const parsed = JSON.parse(content)
      expect(parsed).toEqual({ hooks: { SessionStart: [{ command: 'specd' }] } })
      expect(content.endsWith('\n')).toBe(true)
    })

    it('given existing JSON file, when merged, then preserves existing top-level keys', async () => {
      const targetFile = path.join(tempDir, 'settings.json')
      await writeFile(
        targetFile,
        JSON.stringify({ permissions: { allow: ['read'] } }, null, 2),
        'utf8',
      )

      await mergeJsonConfig<Record<string, unknown>>(targetFile, (cfg) => ({
        ...cfg,
        hooks: { SessionStart: [] },
      }))

      const parsed = JSON.parse(await readFile(targetFile, 'utf8'))
      expect(parsed.permissions).toEqual({ allow: ['read'] })
      expect(parsed.hooks).toEqual({ SessionStart: [] })
    })
  })

  describe('unmergeJsonConfig', () => {
    it('given non-existent file, when unmerged, then gracefully acts as a no-op without creating file', async () => {
      const targetFile = path.join(tempDir, 'non-existent.json')

      await expect(
        unmergeJsonConfig<Record<string, unknown>>(targetFile, (cfg) => cfg),
      ).resolves.not.toThrow()

      const exists = await readFile(targetFile, 'utf8')
        .then(() => true)
        .catch(() => false)
      expect(exists).toBe(false)
    })

    it('given existing JSON file, when unmerged, then updates file according to updater function', async () => {
      const targetFile = path.join(tempDir, 'opencode.json')
      await writeFile(
        targetFile,
        JSON.stringify(
          { plugins: ['./.opencode/plugins/specd-agent-init.ts', 'custom.ts'] },
          null,
          2,
        ),
        'utf8',
      )

      await unmergeJsonConfig<{ plugins?: string[] }>(targetFile, (cfg) => ({
        ...cfg,
        plugins: (cfg.plugins ?? []).filter((p) => !p.includes('specd-')),
      }))

      const parsed = JSON.parse(await readFile(targetFile, 'utf8'))
      expect(parsed.plugins).toEqual(['custom.ts'])
    })
  })
})
