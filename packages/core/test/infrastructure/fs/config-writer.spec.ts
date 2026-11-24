import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parse as yamlParse } from 'yaml'
import { FsConfigWriter } from '../../../src/infrastructure/fs/config-writer.js'
import { AlreadyInitialisedError } from '../../../src/application/errors/already-initialised-error.js'
import { ConfigValidationError } from '../../../src/domain/errors/config-validation-error.js'
import * as writeAtomic from '../../../src/infrastructure/fs/write-atomic.js'
import { LegacyConfigFormatError } from '../../../src/domain/errors/legacy-config-format-error.js'
import { UnsupportedConfigVersionError } from '../../../src/domain/errors/unsupported-config-version-error.js'

vi.mock('../../../src/infrastructure/fs/write-atomic.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../src/infrastructure/fs/write-atomic.js')>()
  return { ...actual, writeFileAtomic: vi.fn(actual.writeFileAtomic) }
})

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
      expect(result.metadataCachePath).toBe('.specd/metadata')

      const content = await fs.readFile(result.configPath, 'utf8')
      const parsed = yamlParse(content) as Record<string, unknown>
      expect(parsed['configVersion']).toBe(2)
      expect(content.startsWith('configVersion:')).toBe(true)
      expect(parsed['schema']).toBe('@specd/schema-std')
      expect(parsed['workspaces']).toHaveProperty('default')
      const workspaces = parsed['workspaces'] as Record<string, unknown>
      const ws = workspaces['default'] as Record<string, unknown>
      const specs = ws['specs'] as Record<string, unknown>
      const adapter = specs['adapter'] as Record<string, unknown>
      expect(adapter['type']).toBe('fs')
      expect((adapter['config'] as Record<string, unknown>)['path']).toBe('specs/')
      expect(parsed['storage']).toBeUndefined()
    })

    it('creates storage directories', async () => {
      await writer.initProject(defaultOptions())

      const storageBase = path.join(tmpDir, '.specd')
      const dirs = ['changes', 'drafts', 'discarded', 'archive', 'metadata']
      for (const dir of dirs) {
        const stat = await fs.stat(path.join(storageBase, dir))
        expect(stat.isDirectory()).toBe(true)
      }
    })

    it('creates workspace specs directory', async () => {
      await writer.initProject(defaultOptions())

      const specsPath = path.join(tmpDir, 'specs')
      const stat = await fs.stat(specsPath)
      expect(stat.isDirectory()).toBe(true)
    })

    it('appends both specd.local.yaml and specd.local.*.yaml to .gitignore', async () => {
      await writer.initProject(defaultOptions())

      const gitignore = await fs.readFile(path.join(tmpDir, '.gitignore'), 'utf8')
      expect(gitignore).toContain('specd.local.yaml')
      expect(gitignore).toContain('specd.local.*.yaml')
      expect(gitignore).toContain('/.specd/metadata/')
    })

    it('does not duplicate metadata gitignore entry across reruns', async () => {
      await writer.initProject(defaultOptions())
      await writer.initProject({ ...defaultOptions(), force: true })

      const gitignore = await fs.readFile(path.join(tmpDir, '.gitignore'), 'utf8')
      const metadataCount = gitignore
        .split('\n')
        .filter((line) => line.trim() === '/.specd/metadata/').length
      expect(metadataCount).toBe(1)
    })

    it('does not duplicate gitignore entries across reruns', async () => {
      await writer.initProject(defaultOptions())
      await writer.initProject({ ...defaultOptions(), force: true })

      const gitignore = await fs.readFile(path.join(tmpDir, '.gitignore'), 'utf8')
      const localCount = gitignore.split('\n').filter((l) => l.trim() === 'specd.local.yaml').length
      const globCount = gitignore
        .split('\n')
        .filter((l) => l.trim() === 'specd.local.*.yaml').length
      expect(localCount).toBe(1)
      expect(globCount).toBe(1)
    })

    it('does not create archive-local .gitignore during init', async () => {
      await writer.initProject(defaultOptions())

      await expect(fs.stat(path.join(tmpDir, '.specd', 'archive', '.gitignore'))).rejects.toThrow()
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
      const adapter = specs['adapter'] as Record<string, unknown>
      expect(adapter['type']).toBe('fs')
      expect((adapter['config'] as Record<string, unknown>)['path']).toBe('my-specs/')
    })
  })

  describe('addPlugin', () => {
    it('adds a plugin to the flat list', async () => {
      const { configPath } = await writer.initProject(defaultOptions())

      await writer.addPlugin(configPath, '@specd/plugin-agent-claude')

      const plugins = await writer.listPlugins(configPath)
      expect(plugins).toEqual([{ name: '@specd/plugin-agent-claude' }])
    })

    it('updates existing plugin config and contributions without duplicating entries', async () => {
      const { configPath } = await writer.initProject(defaultOptions())

      await writer.addPlugin(configPath, '@specd/plugin-agent-copilot')
      await writer.addPlugin(configPath, '@specd/plugin-agent-copilot', {
        config: { instructionsDir: '.github/copilot/instructions' },
        contributions: ['copilot'],
      })

      const plugins = await writer.listPlugins(configPath)
      expect(plugins).toEqual([
        {
          name: '@specd/plugin-agent-copilot',
          config: { instructionsDir: '.github/copilot/instructions' },
          contributions: ['copilot'],
        },
      ])
    })
  })

  describe('removePlugin', () => {
    it('removes a plugin by name', async () => {
      const { configPath } = await writer.initProject(defaultOptions())
      await writer.addPlugin(configPath, '@specd/plugin-agent-claude')
      await writer.addPlugin(configPath, '@specd/plugin-agent-copilot')

      await writer.removePlugin(configPath, '@specd/plugin-agent-claude')

      const plugins = await writer.listPlugins(configPath)
      expect(plugins).toEqual([{ name: '@specd/plugin-agent-copilot' }])
    })

    it('is a no-op when the name is absent', async () => {
      const { configPath } = await writer.initProject(defaultOptions())
      await writer.addPlugin(configPath, '@specd/plugin-agent-claude')
      const before = await fs.readFile(configPath, 'utf8')
      vi.mocked(writeAtomic.writeFileAtomic).mockClear()

      await writer.removePlugin(configPath, '@specd/plugin-agent-missing')

      expect(writeAtomic.writeFileAtomic).not.toHaveBeenCalled()
      expect(await fs.readFile(configPath, 'utf8')).toBe(before)
      const plugins = await writer.listPlugins(configPath)
      expect(plugins).toEqual([{ name: '@specd/plugin-agent-claude' }])
    })

    it('leaves a file without a plugins key byte-identical', async () => {
      const { configPath } = await writer.initProject(defaultOptions())
      const before = await fs.readFile(configPath, 'utf8')
      vi.mocked(writeAtomic.writeFileAtomic).mockClear()
      await writer.removePlugin(configPath, '@specd/plugin-agent-claude')
      expect(writeAtomic.writeFileAtomic).not.toHaveBeenCalled()
      expect(await fs.readFile(configPath, 'utf8')).toBe(before)
    })
  })

  describe('listPlugins', () => {
    it('returns empty array when config does not exist', async () => {
      const plugins = await writer.listPlugins(path.join(tmpDir, 'nonexistent.yaml'))
      expect(plugins).toEqual([])
    })

    it('rejects an unscoped plugin name', async () => {
      const { configPath } = await writer.initProject(defaultOptions())
      await expect(writer.addPlugin(configPath, 'my-plugin')).rejects.toBeInstanceOf(
        ConfigValidationError,
      )
    })

    it('returns empty array when plugins key is absent', async () => {
      const { configPath } = await writer.initProject(defaultOptions())
      const plugins = await writer.listPlugins(configPath)
      expect(plugins).toEqual([])
    })

    it('throws on a legacy plugins object', async () => {
      const { configPath } = await writer.initProject(defaultOptions())
      await fs.writeFile(
        configPath,
        'schema: "@specd/schema-std"\nplugins:\n  agents:\n    - name: "@specd/plugin-agent-claude"\n',
        'utf8',
      )
      await expect(writer.listPlugins(configPath)).rejects.toBeInstanceOf(LegacyConfigFormatError)
    })

    it('preserves unrelated yaml keys while mutating plugins', async () => {
      const { configPath } = await writer.initProject(defaultOptions())
      const original = await fs.readFile(configPath, 'utf8')

      await writer.addPlugin(configPath, '@specd/plugin-agent-codex', {
        config: { mode: 'workspace' },
      })
      await writer.removePlugin(configPath, '@specd/plugin-agent-codex')

      const after = await fs.readFile(configPath, 'utf8')
      const parsedOriginal = yamlParse(original) as Record<string, unknown>
      const parsedAfter = yamlParse(after) as Record<string, unknown>
      expect(parsedAfter['schema']).toEqual(parsedOriginal['schema'])
      expect(parsedAfter['workspaces']).toEqual(parsedOriginal['workspaces'])
      expect(parsedAfter['storage']).toEqual(parsedOriginal['storage'])
    })
  })

  describe('plugin mutation guarantees', () => {
    it('leaves specd.yaml byte-identical when the plugin name is invalid', async () => {
      const { configPath } = await writer.initProject(defaultOptions())
      const before = await fs.readFile(configPath, 'utf8')
      for (const bad of ['my-plugin', '@scope', 'scope/name', '']) {
        await expect(writer.addPlugin(configPath, bad)).rejects.toBeInstanceOf(
          ConfigValidationError,
        )
      }
      expect(await fs.readFile(configPath, 'utf8')).toBe(before)
    })

    it('creates no file when mutating plugins on an absent config', async () => {
      const missing = path.join(tmpDir, 'absent', 'specd.yaml')
      await expect(writer.addPlugin(missing, '@acme/x')).rejects.toBeInstanceOf(
        ConfigValidationError,
      )
      await expect(writer.removePlugin(missing, '@acme/x')).rejects.toBeInstanceOf(
        ConfigValidationError,
      )
      await expect(fs.access(missing)).rejects.toThrow()
      await expect(fs.access(path.dirname(missing))).rejects.toThrow()
    })

    it('reports the argument error, not a missing file, and creates no file', async () => {
      const missing = path.join(tmpDir, 'absent', 'specd.yaml')
      await expect(writer.addPlugin(missing, 'my-plugin')).rejects.toBeInstanceOf(
        ConfigValidationError,
      )
      await expect(
        writer.addPlugin(missing, '@acme/x', { contributions: [] }),
      ).rejects.toBeInstanceOf(ConfigValidationError)
      await expect(
        writer.addPlugin(missing, 'my-plugin').catch((e: Error) => e.message),
      ).resolves.not.toMatch(/not exist|not found|missing/i)
      await expect(fs.access(missing)).rejects.toThrow()
      await expect(fs.access(path.dirname(missing))).rejects.toThrow()
    })

    it('preserves omitted fields when updating an existing entry', async () => {
      const { configPath } = await writer.initProject(defaultOptions())
      await writer.addPlugin(configPath, '@acme/x', { config: { a: 1 }, contributions: ['audit'] })
      await writer.addPlugin(configPath, '@acme/x', { config: { a: 2 } })
      expect(await writer.listPlugins(configPath)).toEqual([
        { name: '@acme/x', config: { a: 2 }, contributions: ['audit'] },
      ])
      await writer.addPlugin(configPath, '@acme/x', { contributions: ['lint'] })
      expect(await writer.listPlugins(configPath)).toEqual([
        { name: '@acme/x', config: { a: 2 }, contributions: ['lint'] },
      ])
    })

    it('rejects an empty contributions list without writing', async () => {
      const { configPath } = await writer.initProject(defaultOptions())
      const before = await fs.readFile(configPath, 'utf8')
      await expect(
        writer.addPlugin(configPath, '@acme/x', { contributions: [] }),
      ).rejects.toBeInstanceOf(ConfigValidationError)
      expect(await fs.readFile(configPath, 'utf8')).toBe(before)
    })

    it.each([
      [
        'duplicate names',
        "plugins:\n  - name: '@acme/x'\n  - name: '@acme/x'\n",
        /duplicate plugin name '@acme\/x'/,
      ],
      ['an invalid name', "plugins:\n  - name: 'not-scoped'\n", /invalid plugin name/],
      [
        'an unknown key',
        "plugins:\n  - name: '@acme/x'\n    bogus: 1\n",
        /unknown key\(s\) 'bogus'/,
      ],
      [
        'empty contributions',
        "plugins:\n  - name: '@acme/x'\n    contributions: []\n",
        /contributions cannot be empty/,
      ],
    ])('states the real cause for %s in a plugins list', async (_label, plugins, message) => {
      const { configPath } = await writer.initProject(defaultOptions())
      const original = await fs.readFile(configPath, 'utf8')
      const content = `${original}${plugins}`
      await fs.writeFile(configPath, content, 'utf8')
      for (const op of [
        () => writer.addPlugin(configPath, '@acme/other'),
        () => writer.removePlugin(configPath, '@acme/x'),
        () => writer.listPlugins(configPath),
      ]) {
        const err = await op().catch((e: unknown) => e)
        expect(err).toBeInstanceOf(ConfigValidationError)
        expect((err as Error).message).toMatch(message)
      }
      expect(await fs.readFile(configPath, 'utf8')).toBe(content)
    })

    it('rejects a non-mapping YAML root with ConfigValidationError without rewriting', async () => {
      const { configPath } = await writer.initProject(defaultOptions())
      for (const content of ['just a scalar\n', '- a\n- b\n']) {
        await fs.writeFile(configPath, content, 'utf8')
        await expect(writer.addPlugin(configPath, '@acme/x')).rejects.toBeInstanceOf(
          ConfigValidationError,
        )
        expect(await fs.readFile(configPath, 'utf8')).toBe(content)
      }
    })

    it('round-trips config and contributions through addPlugin then listPlugins', async () => {
      const { configPath } = await writer.initProject(defaultOptions())
      await writer.addPlugin(configPath, '@acme/rt', {
        config: { dir: '.x', nested: { a: 1 } },
        contributions: ['one', 'two'],
      })
      expect(await writer.listPlugins(configPath)).toEqual([
        {
          name: '@acme/rt',
          config: { dir: '.x', nested: { a: 1 } },
          contributions: ['one', 'two'],
        },
      ])
    })
  })

  describe('invalid plugins are not rewritten', () => {
    it('refuses a legacy plugins.agents object', async () => {
      const { configPath } = await writer.initProject(defaultOptions())
      await fs.writeFile(
        configPath,
        'schema: "@specd/schema-std"\nplugins:\n  agents:\n    - name: "@specd/plugin-agent-claude"\n',
        'utf8',
      )
      const before = await fs.readFile(configPath, 'utf8')
      await expect(writer.addPlugin(configPath, '@acme/next')).rejects.toBeInstanceOf(
        LegacyConfigFormatError,
      )
      await expect(
        writer.removePlugin(configPath, '@specd/plugin-agent-claude'),
      ).rejects.toBeInstanceOf(LegacyConfigFormatError)
      expect(await fs.readFile(configPath, 'utf8')).toBe(before)
    })

    it('refuses an entry with an empty contributions list', async () => {
      const { configPath } = await writer.initProject(defaultOptions())
      await fs.writeFile(
        configPath,
        'schema: "@specd/schema-std"\nplugins:\n  - name: "@acme/x"\n    contributions: []\n',
        'utf8',
      )
      const before = await fs.readFile(configPath, 'utf8')
      await expect(writer.addPlugin(configPath, '@acme/y')).rejects.toBeInstanceOf(
        ConfigValidationError,
      )
      expect(await fs.readFile(configPath, 'utf8')).toBe(before)
    })

    it('throws ConfigValidationError for malformed YAML without rewriting', async () => {
      const { configPath } = await writer.initProject(defaultOptions())
      await fs.writeFile(
        configPath,
        'schema: "@specd/schema-std"\nplugins:\n  - name: [unclosed\n',
        'utf8',
      )
      const before = await fs.readFile(configPath, 'utf8')
      await expect(writer.addPlugin(configPath, '@acme/y')).rejects.toBeInstanceOf(
        ConfigValidationError,
      )
      await expect(writer.removePlugin(configPath, '@acme/y')).rejects.toBeInstanceOf(
        ConfigValidationError,
      )
      await expect(writer.listPlugins(configPath)).rejects.toBeInstanceOf(ConfigValidationError)
      expect(await fs.readFile(configPath, 'utf8')).toBe(before)
    })

    it('throws ConfigValidationError when the config file is absent for mutations', async () => {
      const missing = path.join(tmpDir, 'missing-specd.yaml')
      await expect(writer.addPlugin(missing, '@acme/x')).rejects.toBeInstanceOf(
        ConfigValidationError,
      )
      await expect(writer.removePlugin(missing, '@acme/x')).rejects.toBeInstanceOf(
        ConfigValidationError,
      )
    })
  })

  it('writes the tmp gitignore under the resolved config path', async () => {
    await writer.initProject(defaultOptions())
    const content = await fs.readFile(
      path.join(tmpDir, '.specd', 'config', 'tmp', '.gitignore'),
      'utf8',
    )
    expect(content.replace(/\r\n/g, '\n')).toBe('*\n!.gitignore\n')
  })

  describe('non-mapping YAML root', () => {
    it.each([
      ['scalar', 'just a string\n'],
      ['sequence', '- a\n- b\n'],
    ])(
      'removePlugin and listPlugins reject a %s root without rewriting the file',
      async (_label, content) => {
        const configPath = path.join(tmpDir, 'specd.yaml')
        await fs.writeFile(configPath, content, 'utf8')
        await expect(writer.removePlugin(configPath, '@acme/x')).rejects.toBeInstanceOf(
          ConfigValidationError,
        )
        await expect(writer.listPlugins(configPath)).rejects.toBeInstanceOf(ConfigValidationError)
        expect(await fs.readFile(configPath, 'utf8')).toBe(content)
      },
    )
  })

  describe('document edge cases', () => {
    it.each([
      ['empty', ''],
      ['comment-only', '# just a comment\n'],
      ['explicit tilde null', '~\n'],
      ['explicit null', 'null\n'],
    ])(
      'addPlugin rejects an %s document and leaves the file untouched, while remove and list see no plugins',
      async (_label, content) => {
        const configPath = path.join(tmpDir, 'specd.yaml')
        await fs.writeFile(configPath, content, 'utf8')
        await expect(writer.addPlugin(configPath, '@acme/x')).rejects.toBeInstanceOf(
          ConfigValidationError,
        )
        expect(await fs.readFile(configPath, 'utf8')).toBe(content)
        await expect(writer.removePlugin(configPath, '@acme/x')).resolves.toBeUndefined()
        expect(await fs.readFile(configPath, 'utf8')).toBe(content)
        expect(await writer.listPlugins(configPath)).toEqual([])
      },
    )

    it('reports a directory path as ConfigValidationError for list, add and remove', async () => {
      const dir = path.join(tmpDir, 'a-directory')
      await fs.mkdir(dir)
      await expect(writer.listPlugins(dir)).rejects.toBeInstanceOf(ConfigValidationError)
      await expect(writer.addPlugin(dir, '@acme/x')).rejects.toBeInstanceOf(ConfigValidationError)
      await expect(writer.removePlugin(dir, '@acme/x')).rejects.toBeInstanceOf(
        ConfigValidationError,
      )
    })

    it('treats explicit undefined option values as omitted', async () => {
      const { configPath } = await writer.initProject(defaultOptions())
      await writer.addPlugin(configPath, '@acme/x', {
        config: { a: 1 },
        contributions: ['c1'],
      })
      await writer.addPlugin(configPath, '@acme/x', {
        config: undefined,
        contributions: undefined,
      } as never)
      expect(await writer.listPlugins(configPath)).toEqual([
        { name: '@acme/x', config: { a: 1 }, contributions: ['c1'] },
      ])
      await writer.addPlugin(configPath, '@acme/y', { config: undefined } as never)
      expect((await writer.listPlugins(configPath))[1]).toEqual({ name: '@acme/y' })
    })
  })

  describe('initProject metadata and gitignore', () => {
    it('keeps the metadata directory and its contents on re-init with force', async () => {
      await writer.initProject(defaultOptions())
      const metadataDir = path.join(tmpDir, '.specd', 'metadata')
      await fs.writeFile(path.join(metadataDir, 'keep.txt'), 'x', 'utf8')
      await expect(writer.initProject({ ...defaultOptions(), force: true })).resolves.toBeDefined()
      expect((await fs.stat(metadataDir)).isDirectory()).toBe(true)
      expect(await fs.readFile(path.join(metadataDir, 'keep.txt'), 'utf8')).toBe('x')
    })

    it('leaves other existing .gitignore content undisturbed', async () => {
      const original = 'node_modules/\n# comment\ndist\n'
      await fs.writeFile(path.join(tmpDir, '.gitignore'), original, 'utf8')
      await writer.initProject(defaultOptions())
      const gitignore = await fs.readFile(path.join(tmpDir, '.gitignore'), 'utf8')
      expect(gitignore.startsWith(original)).toBe(true)
      expect(gitignore).toContain('/.specd/metadata/')
    })

    // InitProjectOptions carries no resolved config, so initProject always writes the defaults.
    // These two spec scenarios cannot be expressed through the writer and are intentionally not faked.
    it.todo('does not relocate a custom filesystem metadataPath (not expressible via initProject)')
    it.todo('skips the metadata gitignore step for non-filesystem repositories (not expressible)')

    it('appends to a .gitignore lacking a trailing newline without merging lines', async () => {
      await fs.writeFile(path.join(tmpDir, '.gitignore'), 'dist', 'utf8')
      await writer.initProject(defaultOptions())
      const lines = (await fs.readFile(path.join(tmpDir, '.gitignore'), 'utf8')).split('\n')
      expect(lines[0]).toBe('dist')
      expect(lines).toContain('/.specd/metadata/')
    })
  })
})

describe('FsConfigWriter with a configVersion newer than supported and no plugins key', () => {
  const content = 'configVersion: 999\nschema: x\n'
  let configPath: string

  beforeEach(async () => {
    configPath = path.join(tmpDir, 'specd.yaml')
    await fs.writeFile(configPath, content, 'utf8')
  })

  it('addPlugin rejects the file without rewriting it', async () => {
    await expect(writer.addPlugin(configPath, '@acme/x')).rejects.toBeInstanceOf(
      UnsupportedConfigVersionError,
    )
    await expect(writer.addPlugin(configPath, '@acme/x')).rejects.toBeInstanceOf(
      ConfigValidationError,
    )
    expect(await fs.readFile(configPath, 'utf8')).toBe(content)
  })

  it('removePlugin treats it as declaring no plugins and leaves it untouched', async () => {
    await expect(writer.removePlugin(configPath, '@acme/x')).resolves.toBeUndefined()
    expect(await fs.readFile(configPath, 'utf8')).toBe(content)
  })

  it('listPlugins treats it as declaring no plugins', async () => {
    await expect(writer.listPlugins(configPath)).resolves.toEqual([])
  })
})
