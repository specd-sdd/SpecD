import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { injectSpecdBlock, removeSpecdBlock } from '../../src/application/specd-block-manager.js'

describe('specd-block-manager', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = path.join(
      os.tmpdir(),
      `specd-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    await mkdir(tempDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  describe('injectSpecdBlock', () => {
    it('given non-existent file, when injecting base block, then creates file with block content', async () => {
      const targetFile = path.join(tempDir, 'CLAUDE.md')

      await injectSpecdBlock(targetFile, 'Base instructions')

      const content = await readFile(targetFile, 'utf8')
      expect(content).toContain('<!-- <specd> -->')
      expect(content).toContain('Base instructions')
      expect(content).toContain('<!-- </specd> -->')
    })

    it('given existing file, when injecting base block, then appends block preserving existing content', async () => {
      const targetFile = path.join(tempDir, 'CLAUDE.md')
      await writeFile(targetFile, '# User Instructions\n\nCustom user rules.\n', 'utf8')

      await injectSpecdBlock(targetFile, 'Base instructions')

      const content = await readFile(targetFile, 'utf8')
      expect(content).toContain('# User Instructions')
      expect(content).toContain('Custom user rules.')
      expect(content).toContain('<!-- <specd> -->')
      expect(content).toContain('Base instructions')
    })

    it('given file with existing base block, when injecting updated block, then replaces block content idempotently', async () => {
      const targetFile = path.join(tempDir, 'CLAUDE.md')
      await injectSpecdBlock(targetFile, 'Old instructions')

      await injectSpecdBlock(targetFile, 'Updated instructions')

      const content = await readFile(targetFile, 'utf8')
      expect(content).toContain('Updated instructions')
      expect(content).not.toContain('Old instructions')
    })

    it('given plugin blockId, when injecting plugin block, then registers agent in opening tag', async () => {
      const targetFile = path.join(tempDir, 'AGENTS.md')

      await injectSpecdBlock(targetFile, 'Base prompt', 'opencode')

      const content = await readFile(targetFile, 'utf8')
      expect(content).toContain('<!-- <specd agents="opencode"> -->')
      expect(content).toContain('Base prompt')
      expect(content).toContain('<!-- </specd> -->')
    })

    it('given file with existing registered agent, when another plugin registers, then appends agent to tag', async () => {
      const targetFile = path.join(tempDir, 'AGENTS.md')
      await injectSpecdBlock(targetFile, 'Base prompt', 'opencode')

      await injectSpecdBlock(targetFile, 'Base prompt', 'codex')

      const content = await readFile(targetFile, 'utf8')
      expect(content).toContain('<!-- <specd agents="opencode,codex"> -->')
    })

    it('given empty or whitespace content with blockId, when injected, then removes registered agent from block', async () => {
      const targetFile = path.join(tempDir, 'AGENTS.md')
      await injectSpecdBlock(targetFile, 'Base prompt', 'opencode')

      await injectSpecdBlock(targetFile, '   ', 'opencode')

      const fileExists = await readFile(targetFile, 'utf8')
        .then(() => true)
        .catch(() => false)
      expect(fileExists).toBe(false)
    })
  })

  describe('removeSpecdBlock', () => {
    it('given shared file with two registered agents, when one plugin removed, then preserves base block and updates tag', async () => {
      const targetFile = path.join(tempDir, 'AGENTS.md')
      await injectSpecdBlock(targetFile, 'Base prompt', 'opencode')
      await injectSpecdBlock(targetFile, 'Base prompt', 'codex')

      await removeSpecdBlock(targetFile, 'opencode')

      const content = await readFile(targetFile, 'utf8')
      expect(content).toContain('<!-- <specd agents="codex"> -->')
      expect(content).toContain('Base prompt')
    })

    it('given shared file with single registered agent, when plugin removed, then deletes entire block', async () => {
      const targetFile = path.join(tempDir, 'AGENTS.md')
      await injectSpecdBlock(targetFile, 'Base prompt', 'opencode')

      await removeSpecdBlock(targetFile, 'opencode')

      const fileExists = await readFile(targetFile, 'utf8')
        .then(() => true)
        .catch(() => false)
      expect(fileExists).toBe(false)
    })

    it('given existing file with legacy plugin marker and base block, when plugin marker removed, then purges legacy marker', async () => {
      const targetFile = path.join(tempDir, 'AGENTS.md')
      await writeFile(
        targetFile,
        '# Existing Project Instructions\n\n<!-- <specd-plugin:opencode> -->\nRegistered by @specd/plugin-agent-opencode\n<!-- </specd-plugin:opencode> -->\n\n<!-- <specd agents="opencode"> -->\n# specd\n<!-- </specd> -->\n',
        'utf8',
      )

      await removeSpecdBlock(targetFile, 'opencode')

      const content = await readFile(targetFile, 'utf8')
      expect(content).not.toContain('<!-- <specd-plugin:opencode> -->')
      expect(content).toContain('# Existing Project Instructions')
    })

    it('given exclusive file with base block, when removed without blockId, then removes base block', async () => {
      const targetFile = path.join(tempDir, 'CLAUDE.md')
      await injectSpecdBlock(targetFile, 'Base prompt')

      await removeSpecdBlock(targetFile)

      const fileExists = await readFile(targetFile, 'utf8')
        .then(() => true)
        .catch(() => false)
      expect(fileExists).toBe(false)
    })
  })
})
