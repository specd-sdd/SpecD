import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parse as yamlParse } from 'yaml'
import { FsConfigWriter } from '../../../src/infrastructure/fs/config-writer.js'
import { AlreadyInitialisedError } from '../../../src/application/errors/already-initialised-error.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string
let writer: FsConfigWriter

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-config-writer-test-'))
  writer = new FsConfigWriter()
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

function defaultOptions() {
  return {
    projectRoot: tmpDir,
    schemaRef: '@specd/schema-std',
    workspaceId: 'default',
    specsPath: 'specs/',
  }
}

// ---------------------------------------------------------------------------
// initProject
// ---------------------------------------------------------------------------

describe('FsConfigWriter', () => {
  describe('initProject', () => {
    it('creates specd.yaml with correct structure', async () => {
      const result = await writer.initProject(defaultOptions())

      expect(result.configPath).toBe(path.join(tmpDir, 'specd.yaml'))
      expect(result.schemaRef).toBe('@specd/schema-std')
      expect(result.workspaces).toEqual(['default'])

      const content = await fs.readFile(result.configPath, 'utf8')
      const parsed = yamlParse(content) as Record<string, unknown>
      expect(parsed['schema']).toBe('@specd/schema-std')
      expect(parsed['workspaces']).toHaveProperty('default')
      expect(parsed['storage']).toBeDefined()
    })

    it('creates storage directories', async () => {
      await writer.initProject(defaultOptions())

      const storageBase = path.join(tmpDir, '.specd')
      const dirs = ['changes', 'drafts', 'discarded', 'archive']
      for (const dir of dirs) {
        const stat = await fs.stat(path.join(storageBase, dir))
        expect(stat.isDirectory()).toBe(true)
      }
    })

    it('appends specd.local.yaml to .gitignore', async () => {
      await writer.initProject(defaultOptions())

      const gitignore = await fs.readFile(path.join(tmpDir, '.gitignore'), 'utf8')
      expect(gitignore).toContain('specd.local.yaml')
    })

    it('throws AlreadyInitialisedError when config exists and force is not set', async () => {
      await writer.initProject(defaultOptions())

      await expect(writer.initProject(defaultOptions())).rejects.toThrow(AlreadyInitialisedError)
    })

    it('overwrites existing config when force is set', async () => {
      await writer.initProject(defaultOptions())

      const result = await writer.initProject({ ...defaultOptions(), force: true })
      expect(result.configPath).toBe(path.join(tmpDir, 'specd.yaml'))
    })

    it('appends trailing slash to specsPath if missing', async () => {
      const result = await writer.initProject({ ...defaultOptions(), specsPath: 'my-specs' })

      const content = await fs.readFile(result.configPath, 'utf8')
      const parsed = yamlParse(content) as Record<string, unknown>
      const workspaces = parsed['workspaces'] as Record<string, unknown>
      const ws = workspaces['default'] as Record<string, unknown>
      const specs = ws['specs'] as Record<string, unknown>
      const fsConf = specs['fs'] as Record<string, unknown>
      expect(fsConf['path']).toBe('my-specs/')
    })
  })

  describe('recordSkillInstall', () => {
    it('records skill names under the agent key', async () => {
      const { configPath } = await writer.initProject(defaultOptions())

      await writer.recordSkillInstall(configPath, 'claude', ['review', 'lint'])

      const manifest = await writer.readSkillsManifest(configPath)
      expect(manifest['claude']).toEqual(expect.arrayContaining(['review', 'lint']))
    })

    it('merges with existing skills without duplicates', async () => {
      const { configPath } = await writer.initProject(defaultOptions())

      await writer.recordSkillInstall(configPath, 'claude', ['review'])
      await writer.recordSkillInstall(configPath, 'claude', ['review', 'lint'])

      const manifest = await writer.readSkillsManifest(configPath)
      expect(manifest['claude']).toEqual(['review', 'lint'])
    })
  })

  describe('readSkillsManifest', () => {
    it('returns empty object when config does not exist', async () => {
      const manifest = await writer.readSkillsManifest(path.join(tmpDir, 'nonexistent.yaml'))
      expect(manifest).toEqual({})
    })

    it('returns empty object when skills key is absent', async () => {
      const { configPath } = await writer.initProject(defaultOptions())

      const manifest = await writer.readSkillsManifest(configPath)
      expect(manifest).toEqual({})
    })
  })
})
