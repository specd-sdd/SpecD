import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { execSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  FsConfigLoader,
  type FsConfigLoaderOptions,
} from '../../../src/infrastructure/fs/config-loader.js'
import { ConfigValidationError } from '../../../src/domain/errors/config-validation-error.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string

beforeEach(async () => {
  // Resolve symlinks so paths match what git rev-parse returns
  // (e.g. macOS /var → /private/var).
  const raw = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-config-loader-test-'))
  tmpDir = await fs.realpath(raw)
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })

  // Clean up environment variables
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('SPECD_')) {
      delete process.env[key]
    }
  }
})

/** Writes a specd.yaml to tmpDir with the given content and returns the path. */
async function writeConfig(content: string, filename = 'specd.yaml'): Promise<string> {
  const filePath = path.join(tmpDir, filename)
  await fs.writeFile(filePath, content, 'utf-8')
  return filePath
}

/** Minimal valid specd.yaml template. */
function minimalYaml(extra = ''): string {
  return `
schema: "@specd/schema-std"

workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs

storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
${extra}
`.trim()
}

/**
 * Creates an `FsConfigLoader` using the explicit root-boundary constructor.
 *
 * Tests still construct the infrastructure adapter directly, so this helper
 * mirrors the composition-layer root resolution contract.
 *
 * @param options - Loader construction options
 * @returns A filesystem config loader
 */
function createLoader(options: FsConfigLoaderOptions): FsConfigLoader {
  const probeDir = 'configPath' in options ? path.dirname(options.configPath) : options.startDir
  const rootPath = (() => {
    try {
      return execSync('git rev-parse --show-toplevel', {
        cwd: probeDir,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
    } catch {
      return null
    }
  })()
  return new FsConfigLoader(rootPath, options)
}

// ---------------------------------------------------------------------------
// Requirement: Project-level contextIncludeSpecs / contextExcludeSpecs
// ---------------------------------------------------------------------------

describe('FsConfigLoader', () => {
  describe('Requirement: Logging configuration', () => {
    it('defaults logging level to info when logging section is absent', async () => {
      const configPath = await writeConfig(minimalYaml())
      const loader = createLoader({ configPath })
      const config = await loader.load()

      expect(config.logging?.level).toBe('info')
    })

    it('accepts explicit logging level', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
logging:
  level: debug
`),
      )

      const loader = createLoader({ configPath })
      const config = await loader.load()

      expect(config.logging?.level).toBe('debug')
    })
  })

  describe('Requirement: configPath', () => {
    it('defaults configPath to .specd/config under the config directory', async () => {
      const configPath = await writeConfig(minimalYaml())

      const loader = createLoader({ configPath })
      const config = await loader.load()

      expect(config.configPath).toBe(path.join(tmpDir, '.specd', 'config'))
    })

    it('resolves an explicit configPath relative to specd.yaml', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
configPath: .specd/custom-config
`),
      )

      const loader = createLoader({ configPath })
      const config = await loader.load()

      expect(config.configPath).toBe(path.join(tmpDir, '.specd', 'custom-config'))
    })

    it('rejects configPath values outside the repo root', async () => {
      execSync('git init', { cwd: tmpDir, stdio: 'ignore' })
      const configPath = await writeConfig(
        minimalYaml(`
configPath: ../outside
`),
      )

      const loader = createLoader({ configPath })

      await expect(loader.load()).rejects.toThrow(/configPath resolves outside VCS root/)
    })
  })

  describe('Requirement: Named storage adapters', () => {
    it('preserves named fs adapter bindings with resolved absolute paths', async () => {
      const configPath = await writeConfig(minimalYaml())

      const loader = createLoader({ configPath })
      const config = await loader.load()

      expect(config.workspaces[0]?.specsAdapter).toEqual({
        adapter: 'fs',
        config: { path: path.join(tmpDir, 'specs') },
      })
      expect(config.storage.archiveAdapter).toEqual({
        adapter: 'fs',
        config: { path: path.join(tmpDir, '.specd', 'archive') },
      })
    })

    it('preserves non-fs adapter names and opaque config for kernel-time validation', async () => {
      const configPath = await writeConfig(
        `
schema: "@specd/schema-std"
workspaces:
  default:
    specs:
      adapter: git
      git:
        remote: origin
storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim(),
      )

      const loader = createLoader({ configPath })
      const config = await loader.load()

      expect(config.workspaces[0]?.specsAdapter).toEqual({
        adapter: 'git',
        config: { remote: 'origin' },
      })
    })
  })

  describe('Requirement: Project-level contextIncludeSpecs/contextExcludeSpecs', () => {
    it('reads project-level contextIncludeSpecs into SpecdConfig', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
contextIncludeSpecs:
  - 'default:*'
  - 'billing:arch/*'
`),
      )

      const loader = createLoader({ configPath })
      const config = await loader.load()

      expect(config.contextIncludeSpecs).toEqual(['default:*', 'billing:arch/*'])
    })

    it('reads project-level contextExcludeSpecs into SpecdConfig', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
contextExcludeSpecs:
  - 'default:drafts/*'
`),
      )

      const loader = createLoader({ configPath })
      const config = await loader.load()

      expect(config.contextExcludeSpecs).toEqual(['default:drafts/*'])
    })

    it('omits contextIncludeSpecs from SpecdConfig when not declared', async () => {
      const configPath = await writeConfig(minimalYaml())

      const loader = createLoader({ configPath })
      const config = await loader.load()

      expect(config.contextIncludeSpecs).toBeUndefined()
    })

    it('omits contextExcludeSpecs from SpecdConfig when not declared', async () => {
      const configPath = await writeConfig(minimalYaml())

      const loader = createLoader({ configPath })
      const config = await loader.load()

      expect(config.contextExcludeSpecs).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------------------
  // Requirement: Workspace-level contextIncludeSpecs / contextExcludeSpecs
  // ---------------------------------------------------------------------------

  describe('Requirement: Workspace-level contextIncludeSpecs/contextExcludeSpecs', () => {
    it('reads workspace-level contextIncludeSpecs into SpecdWorkspaceConfig', async () => {
      const configPath = await writeConfig(
        `
schema: "@specd/schema-std"
workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs
    contextIncludeSpecs:
      - '*'
storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim(),
      )

      const loader = createLoader({ configPath })
      const config = await loader.load()

      const defaultWs = config.workspaces.find((w) => w.name === 'default')
      expect(defaultWs?.contextIncludeSpecs).toEqual(['*'])
    })

    it('reads workspace-level contextExcludeSpecs into SpecdWorkspaceConfig', async () => {
      const configPath = await writeConfig(
        `
schema: "@specd/schema-std"
workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs
    contextExcludeSpecs:
      - 'internal/*'
storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim(),
      )

      const loader = createLoader({ configPath })
      const config = await loader.load()

      const defaultWs = config.workspaces.find((w) => w.name === 'default')
      expect(defaultWs?.contextExcludeSpecs).toEqual(['internal/*'])
    })

    it('omits workspace contextIncludeSpecs when not declared', async () => {
      const configPath = await writeConfig(minimalYaml())

      const loader = createLoader({ configPath })
      const config = await loader.load()

      const defaultWs = config.workspaces.find((w) => w.name === 'default')
      expect(defaultWs?.contextIncludeSpecs).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------------------
  // Requirement: Workspace prefix validation
  // ---------------------------------------------------------------------------

  describe('Requirement: Workspace prefix', () => {
    it('reads workspace prefix into SpecdWorkspaceConfig', async () => {
      const configPath = await writeConfig(
        `
schema: "@specd/schema-std"
workspaces:
  default:
    prefix: _global
    specs:
      adapter: fs
      fs:
        path: specs
storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim(),
      )

      const loader = createLoader({ configPath })
      const config = await loader.load()

      const defaultWs = config.workspaces.find((w) => w.name === 'default')
      expect(defaultWs?.prefix).toBe('_global')
    })

    it('omits prefix from SpecdWorkspaceConfig when not declared', async () => {
      const configPath = await writeConfig(minimalYaml())

      const loader = createLoader({ configPath })
      const config = await loader.load()

      const defaultWs = config.workspaces.find((w) => w.name === 'default')
      expect(defaultWs?.prefix).toBeUndefined()
    })

    it('accepts multi-segment prefix', async () => {
      const configPath = await writeConfig(
        `
schema: "@specd/schema-std"
workspaces:
  default:
    prefix: team_1/shared/core
    specs:
      adapter: fs
      fs:
        path: specs
storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim(),
      )

      const loader = createLoader({ configPath })
      const config = await loader.load()

      const defaultWs = config.workspaces.find((w) => w.name === 'default')
      expect(defaultWs?.prefix).toBe('team_1/shared/core')
    })

    it('rejects prefix with leading slash', async () => {
      const configPath = await writeConfig(
        `
schema: "@specd/schema-std"
workspaces:
  default:
    prefix: /_global
    specs:
      adapter: fs
      fs:
        path: specs
storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim(),
      )

      const loader = createLoader({ configPath })
      await expect(loader.load()).rejects.toThrow()
    })

    it('rejects prefix with dot segment', async () => {
      const configPath = await writeConfig(
        `
schema: "@specd/schema-std"
workspaces:
  default:
    prefix: _global/../evil
    specs:
      adapter: fs
      fs:
        path: specs
storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim(),
      )

      const loader = createLoader({ configPath })
      await expect(loader.load()).rejects.toThrow()
    })

    it('rejects prefix with uppercase characters', async () => {
      const configPath = await writeConfig(
        `
schema: "@specd/schema-std"
workspaces:
  default:
    prefix: Global
    specs:
      adapter: fs
      fs:
        path: specs
storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim(),
      )

      const loader = createLoader({ configPath })
      await expect(loader.load()).rejects.toThrow()
    })

    it('rejects empty string prefix', async () => {
      const configPath = await writeConfig(
        `
schema: "@specd/schema-std"
workspaces:
  default:
    prefix: ""
    specs:
      adapter: fs
      fs:
        path: specs
storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim(),
      )

      const loader = createLoader({ configPath })
      await expect(loader.load()).rejects.toThrow()
    })
  })

  // ---------------------------------------------------------------------------
  // Requirement: specd.local.yaml takes precedence
  // ---------------------------------------------------------------------------

  describe('Requirement: specd.local.yaml takes precedence', () => {
    it('uses specd.local.yaml when specd.yaml does not exist', async () => {
      // Only local — no specd.yaml at all
      await writeConfig(
        minimalYaml(`
contextIncludeSpecs:
  - 'default:local-only/*'
`),
        'specd.local.yaml',
      )

      const loader = createLoader({ startDir: tmpDir })
      const config = await loader.load()

      expect(config.contextIncludeSpecs).toEqual(['default:local-only/*'])
    })

    it('uses specd.local.yaml exclusively when present alongside specd.yaml', async () => {
      await writeConfig(
        minimalYaml(`
contextIncludeSpecs:
  - 'default:*'
`),
      )
      // local override has different contextIncludeSpecs
      await writeConfig(
        minimalYaml(`
contextIncludeSpecs:
  - 'default:arch/*'
`),
        'specd.local.yaml',
      )

      const loader = createLoader({ startDir: tmpDir })
      const config = await loader.load()

      // local override wins — default:arch/* not default:*
      expect(config.contextIncludeSpecs).toEqual(['default:arch/*'])
    })
  })

  // ---------------------------------------------------------------------------
  // Requirement: CWD only when outside git repo
  // ---------------------------------------------------------------------------

  describe('Requirement: CWD only when not inside a git repo', () => {
    it('finds specd.yaml in startDir when no .git exists', async () => {
      // tmpDir has no .git — outside any git repo
      await writeConfig(minimalYaml())

      const loader = createLoader({ startDir: tmpDir })
      const config = await loader.load()

      expect(config.projectRoot).toBe(tmpDir)
    })

    it('does not walk up when outside a git repo', async () => {
      // Place specd.yaml in parent, start from child
      await writeConfig(minimalYaml())
      const childDir = path.join(tmpDir, 'nested')
      await fs.mkdir(childDir, { recursive: true })

      const loader = createLoader({ startDir: childDir })
      await expect(loader.load()).rejects.toThrow('no specd.yaml found')
    })
  })

  // ---------------------------------------------------------------------------
  // Requirement: Context entries
  // ---------------------------------------------------------------------------

  describe('Requirement: context entries', () => {
    it('reads context file and instruction entries into SpecdConfig', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
context:
  - file: AGENTS.md
  - instruction: 'Always prefer editing existing files.'
`),
      )

      const loader = createLoader({ configPath })
      const config = await loader.load()

      expect(config.context).toHaveLength(2)
      const configDir = path.dirname(configPath)
      expect(config.context?.[0]).toEqual({ file: path.resolve(configDir, 'AGENTS.md') })
      expect(config.context?.[1]).toEqual({ instruction: 'Always prefer editing existing files.' })
    })

    it('omits context from SpecdConfig when not declared', async () => {
      const configPath = await writeConfig(minimalYaml())

      const loader = createLoader({ configPath })
      const config = await loader.load()

      expect(config.context).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------------------
  // Requirement: contextMode validation
  // ---------------------------------------------------------------------------

  describe('contextMode', () => {
    it("accepts 'list'", async () => {
      const configPath = await writeConfig(
        minimalYaml(`
contextMode: 'list'
`),
      )

      const loader = createLoader({ configPath })
      const config = await loader.load()

      expect(config.contextMode).toBe('list')
    })

    it("accepts 'summary'", async () => {
      const configPath = await writeConfig(
        minimalYaml(`
contextMode: 'summary'
`),
      )

      const loader = createLoader({ configPath })
      const config = await loader.load()

      expect(config.contextMode).toBe('summary')
    })

    it("accepts 'full'", async () => {
      const configPath = await writeConfig(
        minimalYaml(`
contextMode: 'full'
`),
      )

      const loader = createLoader({ configPath })
      const config = await loader.load()

      expect(config.contextMode).toBe('full')
    })

    it("accepts 'hybrid'", async () => {
      const configPath = await writeConfig(
        minimalYaml(`
contextMode: 'hybrid'
`),
      )

      const loader = createLoader({ configPath })
      const config = await loader.load()

      expect(config.contextMode).toBe('hybrid')
    })

    it('omits contextMode from SpecdConfig when not declared', async () => {
      const configPath = await writeConfig(minimalYaml())

      const loader = createLoader({ configPath })
      const config = await loader.load()

      expect(config.contextMode).toBeUndefined()
    })

    it('rejects legacy lazy contextMode value', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
contextMode: 'lazy'
`),
      )

      const loader = createLoader({ configPath })
      await expect(loader.load()).rejects.toThrow()
    })

    it('rejects invalid contextMode value', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
contextMode: 'partial'
`),
      )

      const loader = createLoader({ configPath })
      await expect(loader.load()).rejects.toThrow()
    })

    it('rejects contextMode placed inside a workspace entry', async () => {
      const configPath = await writeConfig(
        `
schema: "@specd/schema-std"
workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs
    contextMode: 'summary'
storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim(),
      )

      const loader = createLoader({ configPath })
      await expect(loader.load()).rejects.toThrow(
        /`contextMode` is not valid inside a workspace — it is a project-level setting/,
      )
    })
  })

  describe('Requirement: Startup validation and config field parsing', () => {
    it('rejects invalid specd.local.yaml as a standalone config', async () => {
      await writeConfig(minimalYaml(), 'specd.yaml')
      await writeConfig(
        `
workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs
storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim(),
        'specd.local.yaml',
      )

      const loader = createLoader({ startDir: tmpDir })
      await expect(loader.load()).rejects.toThrow(/schema/)
    })

    it('emits warnings when legacy config format is used', async () => {
      const configPath = await writeConfig(
        `
schema: "@specd/schema-std"
workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs
storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim(),
      )

      const loader = createLoader({ configPath })
      const config = await loader.load()
      expect(config.warnings).toBeDefined()
      expect(config.warnings).toContain(
        "Legacy configuration format detected at 'workspaces.default.specs'. Please migrate to 'adapter: { type: \"fs\", config: ... }' (the legacy format will be removed in future versions).",
      )
      expect(config.warnings).toContain(
        "Legacy configuration format detected at 'storage.changes'. Please migrate to 'adapter: { type: \"fs\", config: ... }' (the legacy format will be removed in future versions).",
      )
    })

    it('does not emit warnings when storage is omitted and defaults are applied', async () => {
      const configPath = await writeConfig(
        `
schema: "@specd/schema-std"
workspaces:
  default:
    specs:
      adapter:
        type: fs
        config:
          path: specs
`.trim(),
      )

      const loader = createLoader({ configPath })
      const config = await loader.load()
      expect(config.warnings).toBeUndefined()
    })

    it('parses schemaPlugins from config', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
schemaPlugins:
  - '@specd/plugin-agent-claude'
  - '#local-plugin'
`),
      )

      const loader = createLoader({ configPath })
      const config = await loader.load()

      expect(config.schemaPlugins).toEqual(['@specd/plugin-agent-claude', '#local-plugin'])
    })

    it('parses schemaOverrides from config', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
schemaOverrides:
  append:
    artifacts:
      - id: specs
`),
      )

      const loader = createLoader({ configPath })
      const config = await loader.load()

      expect(config.schemaOverrides).toBeDefined()
      expect(config.schemaOverrides).toMatchObject({
        append: {
          artifacts: [{ id: 'specs' }],
        },
      })
    })

    it('parses approvals booleans from config', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
approvals:
  spec: true
  signoff: false
`),
      )

      const loader = createLoader({ configPath })
      const config = await loader.load()

      expect(config.approvals).toEqual({ spec: true, signoff: false })
    })

    it('parses llmOptimizedContext boolean from config', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
llmOptimizedContext: true
`),
      )

      const loader = createLoader({ configPath })
      const config = await loader.load()

      expect(config.llmOptimizedContext).toBe(true)
    })

    it('rejects non-boolean llmOptimizedContext', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
llmOptimizedContext: "yes"
`),
      )

      const loader = createLoader({ configPath })
      await expect(loader.load()).rejects.toThrow(/llmOptimizedContext/)
    })

    it('rejects legacy artifactRules field with migration guidance', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
artifactRules:
  specs:
    - "legacy"
`),
      )

      const loader = createLoader({ configPath })
      await expect(loader.load()).rejects.toThrow(/schemaOverrides/)
    })

    it('rejects legacy skills field with plugin-system guidance', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
skills:
  codex:
    - specd
`),
      )

      const loader = createLoader({ configPath })
      await expect(loader.load()).rejects.toThrow(/managed via the plugin system/)
    })
  })

  describe('Requirement: plugins section validation', () => {
    it('parses plugins.agents entries with optional config', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
plugins:
  agents:
    - name: '@specd/plugin-agent-claude'
    - name: '@specd/plugin-agent-codex'
      config:
        commandsDir: .codex/commands
`),
      )

      const loader = createLoader({ configPath })
      const config = await loader.load()

      expect(config.plugins).toEqual({
        agents: [
          { name: '@specd/plugin-agent-claude' },
          {
            name: '@specd/plugin-agent-codex',
            config: { commandsDir: '.codex/commands' },
          },
        ],
      })
    })

    it('rejects invalid plugin entries missing required name', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
plugins:
  agents:
    - config:
        commandsDir: .codex/commands
`),
      )

      const loader = createLoader({ configPath })
      await expect(loader.load()).rejects.toThrow(/plugins\.agents\[0\]\.name/)
    })
  })

  // ---------------------------------------------------------------------------
  // Requirement: contextIncludeSpecs / contextExcludeSpecs pattern validation
  // ---------------------------------------------------------------------------

  describe('Requirement: Invalid pattern syntax aborts startup', () => {
    it('accepts bare wildcard pattern', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
contextIncludeSpecs:
  - '*'
`),
      )
      const loader = createLoader({ configPath })
      const config = await loader.load()
      expect(config.contextIncludeSpecs).toEqual(['*'])
    })

    it('accepts workspace:* pattern', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
contextIncludeSpecs:
  - 'billing:*'
`),
      )
      const loader = createLoader({ configPath })
      const config = await loader.load()
      expect(config.contextIncludeSpecs).toEqual(['billing:*'])
    })

    it('accepts prefix/* pattern', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
contextIncludeSpecs:
  - '_global/*'
`),
      )
      const loader = createLoader({ configPath })
      const config = await loader.load()
      expect(config.contextIncludeSpecs).toEqual(['_global/*'])
    })

    it('accepts workspace:prefix/* pattern', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
contextIncludeSpecs:
  - 'default:auth/*'
`),
      )
      const loader = createLoader({ configPath })
      const config = await loader.load()
      expect(config.contextIncludeSpecs).toEqual(['default:auth/*'])
    })

    it('accepts exact spec path', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
contextExcludeSpecs:
  - 'auth/login'
`),
      )
      const loader = createLoader({ configPath })
      const config = await loader.load()
      expect(config.contextExcludeSpecs).toEqual(['auth/login'])
    })

    it('rejects wildcard in middle of path segment', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
contextIncludeSpecs:
  - 'auth/lo*in'
`),
      )
      const loader = createLoader({ configPath })
      await expect(loader.load()).rejects.toThrow(/disallowed position/)
    })

    it('rejects wildcard not preceded by /', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
contextIncludeSpecs:
  - 'auth*'
`),
      )
      const loader = createLoader({ configPath })
      await expect(loader.load()).rejects.toThrow(/disallowed position/)
    })

    it('rejects multiple wildcards', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
contextIncludeSpecs:
  - '*/*'
`),
      )
      const loader = createLoader({ configPath })
      await expect(loader.load()).rejects.toThrow(/disallowed position/)
    })

    it('rejects empty pattern', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
contextIncludeSpecs:
  - ''
`),
      )
      const loader = createLoader({ configPath })
      await expect(loader.load()).rejects.toThrow(/invalid pattern/)
    })

    it('validates workspace-level patterns too', async () => {
      const configPath = await writeConfig(
        `
schema: "@specd/schema-std"
workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs
    contextIncludeSpecs:
      - 'auth*'
storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim(),
      )
      const loader = createLoader({ configPath })
      await expect(loader.load()).rejects.toThrow(/disallowed position/)
    })
  })

  describe('Requirement: Storage paths must remain within repo root', () => {
    it('throws ConfigValidationError when a storage path resolves outside the VCS root', async () => {
      // Initialise a real git repo so createVcsAdapter detects it
      execSync('git init', { cwd: tmpDir, stdio: 'ignore' })

      const yaml = `
schema: "@specd/schema-std"

workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs

storage:
  changes:
    adapter: fs
    fs:
      path: ../../outside-repo/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim()

      const configPath = await writeConfig(yaml)
      const loader = createLoader({ configPath })

      await expect(loader.load()).rejects.toThrow(
        /storage path 'changes' resolves outside VCS root/,
      )
    })

    it('accepts storage paths that are within the VCS root', async () => {
      execSync('git init', { cwd: tmpDir, stdio: 'ignore' })

      const configPath = await writeConfig(minimalYaml())
      const loader = createLoader({ configPath })
      const config = await loader.load()

      expect(config.storage.changesPath).toContain('.specd')
    })
  })

  // ---------------------------------------------------------------------------
  // resolvePath()
  // ---------------------------------------------------------------------------

  describe('resolvePath()', () => {
    it('given discovery mode and specd.yaml found, returns the path without throwing', async () => {
      execSync('git init', { cwd: tmpDir, stdio: 'ignore' })
      await writeConfig(minimalYaml())

      const loader = createLoader({ startDir: tmpDir })
      const result = await loader.resolvePath()

      expect(result).toBe(path.join(tmpDir, 'specd.yaml'))
    })

    it('given discovery mode and no config file found, returns null without throwing', async () => {
      execSync('git init', { cwd: tmpDir, stdio: 'ignore' })

      const loader = createLoader({ startDir: tmpDir })
      const result = await loader.resolvePath()

      expect(result).toBeNull()
    })

    it('given discovery mode, prefers specd.local.yaml over specd.yaml at same level', async () => {
      execSync('git init', { cwd: tmpDir, stdio: 'ignore' })
      await writeConfig(minimalYaml(), 'specd.yaml')
      await writeConfig(minimalYaml(), 'specd.local.yaml')

      const loader = createLoader({ startDir: tmpDir })
      const result = await loader.resolvePath()

      expect(result).toBe(path.join(tmpDir, 'specd.local.yaml'))
    })

    it('given forced mode, returns resolved absolute path even when file does not exist', async () => {
      const nonExistent = path.join(tmpDir, 'custom', 'specd.yaml')

      const loader = createLoader({ configPath: nonExistent })
      const result = await loader.resolvePath()

      expect(result).toBe(nonExistent)
    })

    it('given forced mode with relative path, returns resolved absolute path', async () => {
      const loader = createLoader({ configPath: './specd.yaml' })
      const result = await loader.resolvePath()

      expect(result).toBe(path.resolve('./specd.yaml'))
    })

    it('never throws regardless of filesystem state', async () => {
      const loader = createLoader({ startDir: path.join(tmpDir, 'nonexistent', 'deep') })

      await expect(loader.resolvePath()).resolves.not.toThrow()
    })
  })

  describe('Requirement: Default schemasPath for default workspace', () => {
    it('defaults schemasPath to .specd/schemas when no schemas section is configured', async () => {
      const configPath = await writeConfig(minimalYaml())

      const loader = createLoader({ configPath })
      const config = await loader.load()

      const defaultWs = config.workspaces.find((ws) => ws.name === 'default')
      expect(defaultWs).toBeDefined()
      expect(defaultWs!.schemasPath).toBe(path.join(tmpDir, '.specd/schemas'))
    })
  })

  describe('Requirement: Explicit metadataPath retained on fs binding', () => {
    it('retains absolute metadataPath on the specs adapter binding after load', async () => {
      const configPath = await writeConfig(
        minimalYaml().replace('path: specs', 'path: specs\n        metadataPath: custom-meta'),
      )
      await fs.mkdir(path.join(tmpDir, 'specs'), { recursive: true })

      const loader = createLoader({ configPath })
      const config = await loader.load()

      const defaultWs = config.workspaces.find((ws) => ws.name === 'default')
      expect(defaultWs).toBeDefined()
      expect(defaultWs!.specsAdapter.config.metadataPath).toBe(path.join(tmpDir, 'custom-meta'))
    })
  })

  // ---------------------------------------------------------------------------
  // Requirement: Workspace graph config
  // ---------------------------------------------------------------------------

  describe('Requirement: Workspace graph config', () => {
    it('parses graph.excludePaths and graph.respectGitignore correctly', async () => {
      const configPath = await writeConfig(
        `
schema: "@specd/schema-std"
workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs
    graph:
      respectGitignore: false
      excludePaths:
        - dist/
        - "!dist/keep/"
storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim(),
      )

      const loader = createLoader({ configPath })
      const config = await loader.load()

      const defaultWs = config.workspaces.find((w) => w.name === 'default')
      expect(defaultWs?.graph).toBeDefined()
      expect(defaultWs?.graph?.respectGitignore).toBe(false)
      expect(defaultWs?.graph?.excludePaths).toEqual(['dist/', '!dist/keep/'])
    })

    it('graph field is undefined on workspace when graph block is absent', async () => {
      const configPath = await writeConfig(minimalYaml())

      const loader = createLoader({ configPath })
      const config = await loader.load()

      const defaultWs = config.workspaces.find((w) => w.name === 'default')
      expect(defaultWs?.graph).toBeUndefined()
    })

    it('parses graph.allowedPaths correctly', async () => {
      const configPath = await writeConfig(
        `
schema: "@specd/schema-std"
workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs
    graph:
      allowedPaths:
        - src/**
        - templates/**
storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim(),
      )

      const loader = createLoader({ configPath })
      const config = await loader.load()

      const defaultWs = config.workspaces.find((w) => w.name === 'default')
      expect(defaultWs?.graph?.allowedPaths).toEqual(['src/**', 'templates/**'])
    })

    it('rejects graph.respectGitignore with a non-boolean value', async () => {
      const configPath = await writeConfig(
        `
schema: "@specd/schema-std"
workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs
    graph:
      respectGitignore: "yes"
storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim(),
      )

      const loader = createLoader({ configPath })
      await expect(loader.load()).rejects.toThrow(/workspaces\.default\.graph\.respectGitignore/)
    })

    it('rejects graph.excludePaths when given a bare string instead of array', async () => {
      const configPath = await writeConfig(
        `
schema: "@specd/schema-std"
workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs
    graph:
      excludePaths: "node_modules/"
storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim(),
      )

      const loader = createLoader({ configPath })
      await expect(loader.load()).rejects.toThrow(/workspaces\.default\.graph\.excludePaths/)
    })

    it('rejects graph.allowedPaths when given a bare string instead of array', async () => {
      const configPath = await writeConfig(
        `
schema: "@specd/schema-std"
workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs
    graph:
      allowedPaths: "src/**"
storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim(),
      )

      const loader = createLoader({ configPath })
      await expect(loader.load()).rejects.toThrow(/workspaces\.default\.graph\.allowedPaths/)
    })

    it('rejects unknown fields inside the graph block', async () => {
      const configPath = await writeConfig(
        `
schema: "@specd/schema-std"
workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs
    graph:
      unknownField: true
storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim(),
      )

      const loader = createLoader({ configPath })
      await expect(loader.load()).rejects.toThrow(/workspaces\.default\.graph/)
    })
  })

  describe('Requirement: Project graph config', () => {
    it('reads graph.includePaths and graph.excludePaths into SpecdConfig', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
graph:
  includePaths:
    - docs/**
    - package.json
  excludePaths:
    - specd-sdd/
`),
      )

      const loader = createLoader({ configPath })
      const config = await loader.load()

      expect(config.graph?.includePaths).toEqual(['docs/**', 'package.json'])
      expect(config.graph?.excludePaths).toEqual(['specd-sdd/'])
    })

    it('rejects graph.includePaths when given a bare string instead of array', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
graph:
  includePaths: "docs/**"
`),
      )

      const loader = createLoader({ configPath })
      await expect(loader.load()).rejects.toThrow(/graph\.includePaths/)
    })
  })

  describe('Requirement: Reserved root workspace namespace', () => {
    it('rejects workspace name root', async () => {
      const configPath = await writeConfig(
        `
schema: "@specd/schema-std"
workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs
  root:
    specs:
      adapter: fs
      fs:
        path: root-specs
    codeRoot: .
storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim(),
      )

      const loader = createLoader({ configPath })
      await expect(loader.load()).rejects.toThrow(/workspaces\.root.*reserved/)
    })
  })

  // ---------------------------------------------------------------------------
  // Requirement: Config cascade — extends, merge, removal, forced mode
  // ---------------------------------------------------------------------------

  describe('Requirement: Config cascade resolution', () => {
    it('extends: true merges overlay onto base config', async () => {
      await writeConfig(
        minimalYaml(`
contextIncludeSpecs:
  - 'default:*'
`),
      )
      await writeConfig(
        `
extends: true
contextIncludeSpecs:
  - 'default:arch/*'
`.trim(),
        'specd.local.yaml',
      )

      const loader = createLoader({ startDir: tmpDir })
      const config = await loader.load()

      // Arrays are appended: both entries present
      expect(config.contextIncludeSpecs).toEqual(['default:*', 'default:arch/*'])
    })

    it('extends: <path> attaches when base is in the active chain', async () => {
      await writeConfig(minimalYaml())
      await writeConfig(
        `
extends: specd.yaml
contextIncludeSpecs:
  - 'default:ci/*'
`.trim(),
        'specd.ci.yaml',
      )

      const loader = createLoader({ startDir: tmpDir })
      const config = await loader.load()

      expect(config.contextIncludeSpecs).toEqual(['default:ci/*'])
    })

    it('extends: <path> is skipped when base is not in the active chain', async () => {
      await writeConfig(minimalYaml())
      // This variant extends a file that is NOT in the chain
      await writeConfig(
        `
extends: specd.staging.yaml
contextIncludeSpecs:
  - 'default:staging/*'
`.trim(),
        'specd.production.yaml',
      )

      const loader = createLoader({ startDir: tmpDir })
      const config = await loader.load()

      // Only specd.yaml is active; production overlay is skipped
      expect(config.contextIncludeSpecs).toBeUndefined()
    })

    it('standalone overlay (no extends) discards all prior layers', async () => {
      await writeConfig(
        minimalYaml(`
contextIncludeSpecs:
  - 'default:*'
`),
      )
      // No extends key — standalone root
      await writeConfig(
        minimalYaml(`
contextIncludeSpecs:
  - 'default:fresh/*'
`),
        'specd.local.yaml',
      )

      const loader = createLoader({ startDir: tmpDir })
      const config = await loader.load()

      // Only the standalone local config matters
      expect(config.contextIncludeSpecs).toEqual(['default:fresh/*'])
    })

    it('named variant specd.*.yaml is discovered in lexicographic order', async () => {
      await writeConfig(minimalYaml())
      await writeConfig(
        `
extends: true
context:
  - instruction: 'from ci'
`.trim(),
        'specd.ci.yaml',
      )
      await writeConfig(
        `
extends: true
context:
  - instruction: 'from staging'
`.trim(),
        'specd.staging.yaml',
      )

      const loader = createLoader({ startDir: tmpDir })
      const config = await loader.load()

      // Both overlays attach; arrays are appended in order
      expect(config.context).toHaveLength(2)
      expect(config.context?.[0]).toEqual({ instruction: 'from ci' })
      expect(config.context?.[1]).toEqual({ instruction: 'from staging' })
    })

    it('named local variant specd.local.*.yaml is discovered', async () => {
      await writeConfig(minimalYaml())
      await writeConfig(
        `
extends: true
context:
  - instruction: 'from local mono'
`.trim(),
        'specd.local.mono.yaml',
      )

      const loader = createLoader({ startDir: tmpDir })
      const config = await loader.load()

      expect(config.context).toHaveLength(1)
      expect(config.context?.[0]).toEqual({ instruction: 'from local mono' })
    })
  })

  describe('Requirement: Layer merge semantics', () => {
    it('deep-merges nested objects', async () => {
      await writeConfig(
        `
schema: "@specd/schema-std"
workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs
storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
approvals:
  spec: false
  signoff: false
`.trim(),
      )
      await writeConfig(
        `
extends: true
approvals:
  spec: true
`.trim(),
        'specd.local.yaml',
      )

      const loader = createLoader({ startDir: tmpDir })
      const config = await loader.load()

      // Object merged: spec overridden, signoff preserved
      expect(config.approvals).toEqual({ spec: true, signoff: false })
    })

    it('scalar values are replaced by later layers', async () => {
      await writeConfig(minimalYaml('contextMode: list'))
      await writeConfig(
        `
extends: true
contextMode: full
`.trim(),
        'specd.local.yaml',
      )

      const loader = createLoader({ startDir: tmpDir })
      const config = await loader.load()

      expect(config.contextMode).toBe('full')
    })
  })

  describe('Requirement: Cascade removal semantics', () => {
    it('remove.root strips a top-level field', async () => {
      await writeConfig(
        minimalYaml(`
contextIncludeSpecs:
  - 'default:*'
`),
      )
      await writeConfig(
        `
extends: true
remove:
  root:
    - contextIncludeSpecs
`.trim(),
        'specd.local.yaml',
      )

      const loader = createLoader({ startDir: tmpDir })
      const config = await loader.load()

      expect(config.contextIncludeSpecs).toBeUndefined()
    })

    it('remove.workspaces strips a named workspace', async () => {
      await writeConfig(
        `
schema: "@specd/schema-std"
workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs
  staging:
    specs:
      adapter: fs
      fs:
        path: staging/specs
    codeRoot: staging
storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim(),
      )
      await writeConfig(
        `
extends: true
remove:
  workspaces:
    - staging
`.trim(),
        'specd.local.yaml',
      )

      const loader = createLoader({ startDir: tmpDir })
      const config = await loader.load()

      expect(config.workspaces.map((w) => w.name)).toEqual(['default'])
    })

    it('remove.context strips entries by id', async () => {
      await writeConfig(
        minimalYaml(`
context:
  - id: ci-only
    instruction: 'CI instruction'
  - id: shared
    instruction: 'Shared instruction'
`),
      )
      await writeConfig(
        `
extends: true
remove:
  context:
    - id: ci-only
`.trim(),
        'specd.local.yaml',
      )

      const loader = createLoader({ startDir: tmpDir })
      const config = await loader.load()

      expect(config.context).toHaveLength(1)
      expect(config.context?.[0]).toEqual({ id: 'shared', instruction: 'Shared instruction' })
    })

    it('remove.context strips entries by file', async () => {
      await writeConfig(
        minimalYaml(`
context:
  - file: CI_AGENTS.md
  - file: AGENTS.md
`),
      )
      await writeConfig(
        `
extends: true
remove:
  context:
    - file: CI_AGENTS.md
`.trim(),
        'specd.local.yaml',
      )

      const loader = createLoader({ startDir: tmpDir })
      const config = await loader.load()

      expect(config.context).toHaveLength(1)
      expect(config.context?.[0]).toEqual({ file: path.resolve(tmpDir, 'AGENTS.md') })
    })

    it('remove.plugins.agents strips by name', async () => {
      await writeConfig(
        minimalYaml(`
plugins:
  agents:
    - name: '@specd/plugin-agent-claude'
    - name: '@specd/plugin-agent-copilot'
`),
      )
      await writeConfig(
        `
extends: true
remove:
  plugins:
    agents:
      - name: '@specd/plugin-agent-copilot'
`.trim(),
        'specd.local.yaml',
      )

      const loader = createLoader({ startDir: tmpDir })
      const config = await loader.load()

      expect(config.plugins?.agents).toHaveLength(1)
      expect(config.plugins?.agents?.[0]?.name).toBe('@specd/plugin-agent-claude')
    })

    it('rejects remove without extends', async () => {
      await writeConfig(minimalYaml())
      await writeConfig(
        `
remove:
  root:
    - contextIncludeSpecs
`.trim(),
        'specd.local.yaml',
      )

      const loader = createLoader({ startDir: tmpDir })
      await expect(loader.load()).rejects.toThrow(/'remove' is only valid/)
    })

    it('rejects remove.root targeting schema', async () => {
      await writeConfig(minimalYaml())
      await writeConfig(
        `
extends: true
remove:
  root:
    - schema
`.trim(),
        'specd.local.yaml',
      )

      const loader = createLoader({ startDir: tmpDir })
      await expect(loader.load()).rejects.toThrow(/cannot remove required field 'schema'/)
    })

    it('rejects remove.context with ambiguous match', async () => {
      await writeConfig(
        minimalYaml(`
context:
  - instruction: 'same text'
  - instruction: 'same text'
`),
      )
      await writeConfig(
        `
extends: true
remove:
  context:
    - instruction: 'same text'
`.trim(),
        'specd.local.yaml',
      )

      const loader = createLoader({ startDir: tmpDir })
      await expect(loader.load()).rejects.toThrow(/ambiguous match/)
    })

    it('rejects remove.context with no matching entry', async () => {
      await writeConfig(
        minimalYaml(`
context:
  - instruction: 'keep this'
`),
      )
      await writeConfig(
        `
extends: true
remove:
  context:
    - instruction: 'does not exist'
`.trim(),
        'specd.local.yaml',
      )

      const loader = createLoader({ startDir: tmpDir })
      await expect(loader.load()).rejects.toThrow(/no matching entry/)
    })
  })

  describe('Requirement: Forced mode cascade (closed chain)', () => {
    it('forced mode loads a single file without extends', async () => {
      const configPath = await writeConfig(minimalYaml())
      const loader = createLoader({ configPath })
      const config = await loader.load()

      expect(config.projectRoot).toBe(tmpDir)
    })

    it('forced mode resolves extends: true against specd.yaml in same dir', async () => {
      await writeConfig(minimalYaml())
      const overlayPath = await writeConfig(
        `
extends: true
contextMode: full
`.trim(),
        'specd.local.yaml',
      )

      const loader = createLoader({ configPath: overlayPath })
      const config = await loader.load()

      // Base merged from specd.yaml, overlay applied
      expect(config.contextMode).toBe('full')
    })

    it('forced mode follows explicit extends chain', async () => {
      await writeConfig(minimalYaml())
      await writeConfig(
        `
extends: specd.yaml
context:
  - instruction: 'from ci'
`.trim(),
        'specd.ci.yaml',
      )

      const loader = createLoader({ configPath: path.join(tmpDir, 'specd.ci.yaml') })
      const config = await loader.load()

      expect(config.context).toHaveLength(1)
      expect(config.context?.[0]).toEqual({ instruction: 'from ci' })
    })

    it('forced mode walks extends: true backwards through candidates', async () => {
      await writeConfig(
        minimalYaml(`
context:
  - instruction: 'base'
`),
      )
      await writeConfig(
        `
extends: true
context:
  - instruction: 'local'
`.trim(),
        'specd.local.yaml',
      )
      await writeConfig(
        `
extends: true
context:
  - instruction: 'otro'
`.trim(),
        'specd.local.otro.yaml',
      )

      const loader = createLoader({ configPath: path.join(tmpDir, 'specd.local.otro.yaml') })
      const config = await loader.load()

      expect(config.context).toHaveLength(3)
      expect((config.context?.[0] as { instruction: string }).instruction).toBe('base')
      expect((config.context?.[1] as { instruction: string }).instruction).toBe('local')
      expect((config.context?.[2] as { instruction: string }).instruction).toBe('otro')
    })

    it('forced mode with mixed explicit and extends: true chain', async () => {
      await writeConfig(
        minimalYaml(`
context:
  - instruction: 'base'
`),
      )
      await writeConfig(
        `
extends: true
context:
  - instruction: 'local'
`.trim(),
        'specd.local.yaml',
      )
      await writeConfig(
        `
extends: specd.local.yaml
context:
  - instruction: 'otro'
`.trim(),
        'specd.local.otro.yaml',
      )

      const loader = createLoader({ configPath: path.join(tmpDir, 'specd.local.otro.yaml') })
      const config = await loader.load()

      expect(config.context).toHaveLength(3)
      expect((config.context?.[0] as { instruction: string }).instruction).toBe('base')
      expect((config.context?.[1] as { instruction: string }).instruction).toBe('local')
      expect((config.context?.[2] as { instruction: string }).instruction).toBe('otro')
    })

    it('forced mode throws when extends target does not exist', async () => {
      await writeConfig(minimalYaml())
      await writeConfig(
        `
extends: nonexistent.yaml
context:
  - instruction: 'test'
`.trim(),
        'specd.local.yaml',
      )

      const loader = createLoader({ configPath: path.join(tmpDir, 'specd.local.yaml') })
      await expect(loader.load()).rejects.toThrow(ConfigValidationError)
      await expect(loader.load()).rejects.toThrow(/not found/)
    })

    it('forced mode throws when extends: true and no previous candidate exists', async () => {
      const overlayPath = await writeConfig(
        `
extends: true
context:
  - instruction: 'test'
`.trim(),
        'specd.local.yaml',
      )

      const loader = createLoader({ configPath: overlayPath })
      await expect(loader.load()).rejects.toThrow(ConfigValidationError)
    })

    it('forced mode detects circular extends chain', async () => {
      await writeConfig(minimalYaml())
      await writeConfig(
        `
extends: specd.local.b.yaml
context:
  - instruction: 'a'
`.trim(),
        'specd.local.a.yaml',
      )
      await writeConfig(
        `
extends: specd.local.a.yaml
context:
  - instruction: 'b'
`.trim(),
        'specd.local.b.yaml',
      )

      const loader = createLoader({ configPath: path.join(tmpDir, 'specd.local.a.yaml') })
      await expect(loader.load()).rejects.toThrow(/circular extends chain/)
    })
  })

  describe('Requirement: Invalidation policy configuration', () => {
    it('accepts valid invalidationPolicy values', async () => {
      for (const policy of ['none', 'surgical', 'downstream', 'global']) {
        const configPath = await writeConfig(minimalYaml(`invalidationPolicy: ${policy}`))
        const loader = createLoader({ configPath })
        const config = await loader.load()
        expect(config.invalidationPolicy).toBe(policy)
      }
    })

    it('rejects unknown invalidationPolicy value', async () => {
      const configPath = await writeConfig(minimalYaml('invalidationPolicy: aggressive'))
      const loader = createLoader({ configPath })
      await expect(loader.load()).rejects.toThrow(ConfigValidationError)
    })
  })

  describe('Requirement: Workspaces — default required, non-default codeRoot required', () => {
    it('throws ConfigValidationError when default workspace is missing', async () => {
      const configPath = await writeConfig(
        `
schema: "@specd/schema-std"

workspaces:
  billing:
    specs:
      adapter: fs
      fs:
        path: specs
    codeRoot: ../billing

storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim(),
      )

      const loader = createLoader({ configPath })
      await expect(loader.load()).rejects.toThrow(/workspaces\.default.*required/)
    })

    it('throws ConfigValidationError when non-default workspace omits codeRoot', async () => {
      const configPath = await writeConfig(
        `
schema: "@specd/schema-std"

workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs
  billing:
    specs:
      adapter: fs
      fs:
        path: ../billing/specs

storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim(),
      )

      const loader = createLoader({ configPath })
      await expect(loader.load()).rejects.toThrow(/workspaces\.billing\.codeRoot.*required/)
    })
  })

  describe('Requirement: Workspace field defaults', () => {
    it('defaults default workspace ownership to owned', async () => {
      const configPath = await writeConfig(minimalYaml())
      const loader = createLoader({ configPath })
      const config = await loader.load()

      const ws = config.workspaces.find((w) => w.name === 'default')
      expect(ws?.ownership).toBe('owned')
    })

    it('defaults non-default workspace ownership to readOnly', async () => {
      const configPath = await writeConfig(
        `
schema: "@specd/schema-std"

workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs
  billing:
    specs:
      adapter: fs
      fs:
        path: ../billing/specs
    codeRoot: ../billing

storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim(),
      )
      const loader = createLoader({ configPath })
      const config = await loader.load()

      const ws = config.workspaces.find((w) => w.name === 'billing')
      expect(ws?.ownership).toBe('readOnly')
    })

    it('defaults default workspace codeRoot to config directory', async () => {
      const configPath = await writeConfig(minimalYaml())
      const loader = createLoader({ configPath })
      const config = await loader.load()

      const ws = config.workspaces.find((w) => w.name === 'default')
      expect(ws?.codeRoot).toBe(tmpDir)
    })

    it('sets non-default workspace schemasPath to null when schemas omitted', async () => {
      const configPath = await writeConfig(
        `
schema: "@specd/schema-std"

workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs
  billing:
    specs:
      adapter: fs
      fs:
        path: ../billing/specs
    codeRoot: ../billing

storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim(),
      )
      const loader = createLoader({ configPath })
      const config = await loader.load()

      const ws = config.workspaces.find((w) => w.name === 'billing')
      expect(ws?.schemasPath).toBeNull()
    })
  })

  describe('Requirement: isExternal inference for workspaces', () => {
    it('sets isExternal false when specsPath is inside git root', async () => {
      execSync('git init', { cwd: tmpDir })
      const configPath = await writeConfig(minimalYaml())
      const loader = createLoader({ configPath })
      const config = await loader.load()

      const ws = config.workspaces.find((w) => w.name === 'default')
      expect(ws?.isExternal).toBe(false)
    })

    it('sets isExternal true when specsPath is outside git root', async () => {
      execSync('git init', { cwd: tmpDir })

      const outsideDir = path.join(tmpDir, '..', `specd-external-${Date.now()}`)
      await fs.mkdir(outsideDir, { recursive: true })
      try {
        const configPath = await writeConfig(
          `
schema: "@specd/schema-std"

workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs
  ext:
    specs:
      adapter: fs
      fs:
        path: ${outsideDir}/specs
    codeRoot: ${outsideDir}

storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim(),
        )

        const loader = createLoader({ configPath })
        const config = await loader.load()

        const extWs = config.workspaces.find((w) => w.name === 'ext')
        expect(extWs?.isExternal).toBe(true)
      } finally {
        await fs.rm(outsideDir, { recursive: true, force: true })
      }
    })
  })

  describe('Requirement: Archive pattern preservation', () => {
    it('preserves archivePattern from storage.archive.fs.pattern', async () => {
      const configPath = await writeConfig(
        minimalYaml().replace(
          'path: .specd/archive',
          "path: .specd/archive\n      pattern: '{{year}}/{{change.archivedName}}'",
        ),
      )

      const loader = createLoader({ configPath })
      const config = await loader.load()

      expect(config.storage.archivePattern).toBe('{{year}}/{{change.archivedName}}')
    })
  })

  describe('Requirement: Cascade removal — workspace and storage non-existent keys', () => {
    it('rejects remove.workspaces targeting a non-existent workspace', async () => {
      await writeConfig(minimalYaml())
      await writeConfig(
        `
extends: true
remove:
  workspaces:
    - nonexistent
`,
        'specd.local.yaml',
      )

      const loader = createLoader({ startDir: tmpDir })
      await expect(loader.load()).rejects.toThrow(/remove\.workspaces.*not found/)
    })

    it('rejects remove.storage targeting a non-existent storage key', async () => {
      await writeConfig(minimalYaml())
      await writeConfig(
        `
extends: true
remove:
  storage:
    - backups
`,
        'specd.local.yaml',
      )

      const loader = createLoader({ startDir: tmpDir })
      await expect(loader.load()).rejects.toThrow(/remove\.storage.*not found/)
    })
  })

  describe('Requirement: Invalid extends type', () => {
    it('rejects extends with an object value', async () => {
      await writeConfig(
        `
extends:
  from: specd.yaml
schema: "@specd/schema-std"

workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs

storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim(),
        'specd.local.yaml',
      )

      const loader = createLoader({ startDir: tmpDir })
      await expect(loader.load()).rejects.toThrow(ConfigValidationError)
    })

    it('rejects extends with a numeric value', async () => {
      await writeConfig(
        `
extends: 42
schema: "@specd/schema-std"

workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs

storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim(),
        'specd.local.yaml',
      )

      const loader = createLoader({ startDir: tmpDir })
      await expect(loader.load()).rejects.toThrow(ConfigValidationError)
    })
  })

  describe('Requirement: resolvePath returns root of active chain', () => {
    it('returns specd.yaml as root when no overlays are active', async () => {
      await writeConfig(minimalYaml())
      const loader = createLoader({ startDir: tmpDir })
      const result = await loader.resolvePath()

      expect(result).toBe(path.join(tmpDir, 'specd.yaml'))
    })

    it('returns specd.yaml as root when local overlay extends it', async () => {
      await writeConfig(minimalYaml())
      await writeConfig('extends: true', 'specd.local.yaml')

      const loader = createLoader({ startDir: tmpDir })
      const result = await loader.resolvePath()

      // Root is specd.yaml, not the overlay
      expect(result).toBe(path.join(tmpDir, 'specd.yaml'))
    })

    it('returns standalone local file as root when it has no extends', async () => {
      await writeConfig(minimalYaml(), 'specd.local.yaml')

      const loader = createLoader({ startDir: tmpDir })
      const result = await loader.resolvePath()

      expect(result).toBe(path.join(tmpDir, 'specd.local.yaml'))
    })
  })
})

describe('Requirement: Privacy settings and Environment support', () => {
  it('loads environment variables from .env', async () => {
    await fs.writeFile(path.join(tmpDir, '.env'), 'SPECD_PRIVACY_MODE=mask\n')
    const configPath = await writeConfig(minimalYaml())
    const loader = createLoader({ configPath })
    const config = await loader.load()

    expect(config.privacy?.mode).toBe('mask')
  })

  it('.env.local takes precedence over .env', async () => {
    await fs.writeFile(path.join(tmpDir, '.env'), 'SPECD_PRIVACY_MODE=mask\n')
    await fs.writeFile(
      path.join(tmpDir, '.env.local'),
      'SPECD_PRIVACY_MODE=hash\nSPECD_PRIVACY_SALT=secret\n',
    )
    const configPath = await writeConfig(minimalYaml())
    const loader = createLoader({ configPath })
    const config = await loader.load()

    expect(config.privacy?.mode).toBe('hash')
    expect(config.privacy?.salt).toBe('secret')
  })

  it('overrides specd.yaml with environment variables', async () => {
    const configPath = await writeConfig(minimalYaml('privacy:\n  mode: anonymous'))
    process.env['SPECD_PRIVACY_MODE'] = 'mask'
    try {
      const loader = createLoader({ configPath })
      const config = await loader.load()
      expect(config.privacy?.mode).toBe('mask')
    } finally {
      delete process.env['SPECD_PRIVACY_MODE']
    }
  })

  it('validates that hash mode requires a salt', async () => {
    const configPath = await writeConfig(minimalYaml('privacy:\n  mode: hash'))
    const loader = createLoader({ configPath })
    await expect(loader.load()).rejects.toThrow(
      /privacy\.salt: When privacy\.mode is set to hash, a salt MUST be provided/,
    )
  })

  it('accepts actorProvider selection', async () => {
    const configPath = await writeConfig(minimalYaml('actorProvider: ldap'))
    const loader = createLoader({ configPath })
    const config = await loader.load()
    expect(config.actorProvider).toBe('ldap')
  })
})
