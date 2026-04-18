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

  describe('addPlugin', () => {
    it('adds a plugin under the provided plugin type', async () => {
      const { configPath } = await writer.initProject(defaultOptions())

      await writer.addPlugin(configPath, 'agents', '@specd/plugin-agent-claude')

      const plugins = await writer.listPlugins(configPath, 'agents')
      expect(plugins).toEqual([{ name: '@specd/plugin-agent-claude' }])
    })

    it('updates existing plugin config without duplicating entries', async () => {
      const { configPath } = await writer.initProject(defaultOptions())

      await writer.addPlugin(configPath, 'agents', '@specd/plugin-agent-copilot')
      await writer.addPlugin(configPath, 'agents', '@specd/plugin-agent-copilot', {
        instructionsDir: '.github/copilot/instructions',
      })

      const plugins = await writer.listPlugins(configPath, 'agents')
      expect(plugins).toEqual([
        {
          name: '@specd/plugin-agent-copilot',
          config: { instructionsDir: '.github/copilot/instructions' },
        },
      ])
    })
  })

  describe('removePlugin', () => {
    it('removes a plugin by name from the selected type', async () => {
      const { configPath } = await writer.initProject(defaultOptions())
      await writer.addPlugin(configPath, 'agents', '@specd/plugin-agent-claude')
      await writer.addPlugin(configPath, 'agents', '@specd/plugin-agent-copilot')

      await writer.removePlugin(configPath, 'agents', '@specd/plugin-agent-claude')

      const plugins = await writer.listPlugins(configPath, 'agents')
      expect(plugins).toEqual([{ name: '@specd/plugin-agent-copilot' }])
    })
  })

  describe('listPlugins', () => {
    it('returns empty array when config does not exist', async () => {
      const plugins = await writer.listPlugins(path.join(tmpDir, 'nonexistent.yaml'))
      expect(plugins).toEqual([])
    })

    it('returns empty array when plugins key is absent', async () => {
      const { configPath } = await writer.initProject(defaultOptions())
      const plugins = await writer.listPlugins(configPath)
      expect(plugins).toEqual([])
    })

    it('preserves unrelated yaml keys while mutating plugins', async () => {
      const { configPath } = await writer.initProject(defaultOptions())
      const original = await fs.readFile(configPath, 'utf8')

      await writer.addPlugin(configPath, 'agents', '@specd/plugin-agent-codex', {
        mode: 'workspace',
      })
      await writer.removePlugin(configPath, 'agents', '@specd/plugin-agent-codex')

      const after = await fs.readFile(configPath, 'utf8')
      const parsedOriginal = yamlParse(original) as Record<string, unknown>
      const parsedAfter = yamlParse(after) as Record<string, unknown>
      expect(parsedAfter['schema']).toEqual(parsedOriginal['schema'])
      expect(parsedAfter['workspaces']).toEqual(parsedOriginal['workspaces'])
      expect(parsedAfter['storage']).toEqual(parsedOriginal['storage'])
    })
  })
})
