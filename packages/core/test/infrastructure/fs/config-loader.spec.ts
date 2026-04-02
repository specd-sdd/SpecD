import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { execSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FsConfigLoader } from '../../../src/infrastructure/fs/config-loader.js'

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

// ---------------------------------------------------------------------------
// Requirement: Project-level contextIncludeSpecs / contextExcludeSpecs
// ---------------------------------------------------------------------------

describe('FsConfigLoader', () => {
  describe('Requirement: configPath', () => {
    it('defaults configPath to .specd/config under the config directory', async () => {
      const configPath = await writeConfig(minimalYaml())

      const loader = new FsConfigLoader({ configPath })
      const config = await loader.load()

      expect(config.configPath).toBe(path.join(tmpDir, '.specd', 'config'))
    })

    it('resolves an explicit configPath relative to specd.yaml', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
configPath: .specd/custom-config
`),
      )

      const loader = new FsConfigLoader({ configPath })
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

      const loader = new FsConfigLoader({ configPath })

      await expect(loader.load()).rejects.toThrow(/configPath resolves outside repo root/)
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

      const loader = new FsConfigLoader({ configPath })
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

      const loader = new FsConfigLoader({ configPath })
      const config = await loader.load()

      expect(config.contextExcludeSpecs).toEqual(['default:drafts/*'])
    })

    it('omits contextIncludeSpecs from SpecdConfig when not declared', async () => {
      const configPath = await writeConfig(minimalYaml())

      const loader = new FsConfigLoader({ configPath })
      const config = await loader.load()

      expect(config.contextIncludeSpecs).toBeUndefined()
    })

    it('omits contextExcludeSpecs from SpecdConfig when not declared', async () => {
      const configPath = await writeConfig(minimalYaml())

      const loader = new FsConfigLoader({ configPath })
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

      const loader = new FsConfigLoader({ configPath })
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

      const loader = new FsConfigLoader({ configPath })
      const config = await loader.load()

      const defaultWs = config.workspaces.find((w) => w.name === 'default')
      expect(defaultWs?.contextExcludeSpecs).toEqual(['internal/*'])
    })

    it('omits workspace contextIncludeSpecs when not declared', async () => {
      const configPath = await writeConfig(minimalYaml())

      const loader = new FsConfigLoader({ configPath })
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

      const loader = new FsConfigLoader({ configPath })
      const config = await loader.load()

      const defaultWs = config.workspaces.find((w) => w.name === 'default')
      expect(defaultWs?.prefix).toBe('_global')
    })

    it('omits prefix from SpecdWorkspaceConfig when not declared', async () => {
      const configPath = await writeConfig(minimalYaml())

      const loader = new FsConfigLoader({ configPath })
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

      const loader = new FsConfigLoader({ configPath })
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

      const loader = new FsConfigLoader({ configPath })
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

      const loader = new FsConfigLoader({ configPath })
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

      const loader = new FsConfigLoader({ configPath })
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

      const loader = new FsConfigLoader({ configPath })
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

      const loader = new FsConfigLoader({ startDir: tmpDir })
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

      const loader = new FsConfigLoader({ startDir: tmpDir })
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

      const loader = new FsConfigLoader({ startDir: tmpDir })
      const config = await loader.load()

      expect(config.projectRoot).toBe(tmpDir)
    })

    it('does not walk up when outside a git repo', async () => {
      // Place specd.yaml in parent, start from child
      await writeConfig(minimalYaml())
      const childDir = path.join(tmpDir, 'nested')
      await fs.mkdir(childDir, { recursive: true })

      const loader = new FsConfigLoader({ startDir: childDir })
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

      const loader = new FsConfigLoader({ configPath })
      const config = await loader.load()

      expect(config.context).toHaveLength(2)
      expect(config.context?.[0]).toEqual({ file: 'AGENTS.md' })
      expect(config.context?.[1]).toEqual({ instruction: 'Always prefer editing existing files.' })
    })

    it('omits context from SpecdConfig when not declared', async () => {
      const configPath = await writeConfig(minimalYaml())

      const loader = new FsConfigLoader({ configPath })
      const config = await loader.load()

      expect(config.context).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------------------
  // Requirement: contextMode validation
  // ---------------------------------------------------------------------------

  describe('contextMode', () => {
    it("accepts 'full'", async () => {
      const configPath = await writeConfig(
        minimalYaml(`
contextMode: 'full'
`),
      )

      const loader = new FsConfigLoader({ configPath })
      const config = await loader.load()

      expect(config.contextMode).toBe('full')
    })

    it("accepts 'lazy'", async () => {
      const configPath = await writeConfig(
        minimalYaml(`
contextMode: 'lazy'
`),
      )

      const loader = new FsConfigLoader({ configPath })
      const config = await loader.load()

      expect(config.contextMode).toBe('lazy')
    })

    it('omits contextMode from SpecdConfig when not declared', async () => {
      const configPath = await writeConfig(minimalYaml())

      const loader = new FsConfigLoader({ configPath })
      const config = await loader.load()

      expect(config.contextMode).toBeUndefined()
    })

    it('rejects invalid contextMode value', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
contextMode: 'partial'
`),
      )

      const loader = new FsConfigLoader({ configPath })
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
    contextMode: 'lazy'
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

      const loader = new FsConfigLoader({ configPath })
      await expect(loader.load()).rejects.toThrow()
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
      const loader = new FsConfigLoader({ configPath })
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
      const loader = new FsConfigLoader({ configPath })
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
      const loader = new FsConfigLoader({ configPath })
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
      const loader = new FsConfigLoader({ configPath })
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
      const loader = new FsConfigLoader({ configPath })
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
      const loader = new FsConfigLoader({ configPath })
      await expect(loader.load()).rejects.toThrow(/disallowed position/)
    })

    it('rejects wildcard not preceded by /', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
contextIncludeSpecs:
  - 'auth*'
`),
      )
      const loader = new FsConfigLoader({ configPath })
      await expect(loader.load()).rejects.toThrow(/disallowed position/)
    })

    it('rejects multiple wildcards', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
contextIncludeSpecs:
  - '*/*'
`),
      )
      const loader = new FsConfigLoader({ configPath })
      await expect(loader.load()).rejects.toThrow(/disallowed position/)
    })

    it('rejects empty pattern', async () => {
      const configPath = await writeConfig(
        minimalYaml(`
contextIncludeSpecs:
  - ''
`),
      )
      const loader = new FsConfigLoader({ configPath })
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
      const loader = new FsConfigLoader({ configPath })
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
      const loader = new FsConfigLoader({ configPath })

      await expect(loader.load()).rejects.toThrow(
        /storage path 'changes' resolves outside repo root/,
      )
    })

    it('accepts storage paths that are within the VCS root', async () => {
      execSync('git init', { cwd: tmpDir, stdio: 'ignore' })

      const configPath = await writeConfig(minimalYaml())
      const loader = new FsConfigLoader({ configPath })
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

      const loader = new FsConfigLoader({ startDir: tmpDir })
      const result = await loader.resolvePath()

      expect(result).toBe(path.join(tmpDir, 'specd.yaml'))
    })

    it('given discovery mode and no config file found, returns null without throwing', async () => {
      execSync('git init', { cwd: tmpDir, stdio: 'ignore' })

      const loader = new FsConfigLoader({ startDir: tmpDir })
      const result = await loader.resolvePath()

      expect(result).toBeNull()
    })

    it('given discovery mode, prefers specd.local.yaml over specd.yaml at same level', async () => {
      execSync('git init', { cwd: tmpDir, stdio: 'ignore' })
      await writeConfig(minimalYaml(), 'specd.yaml')
      await writeConfig(minimalYaml(), 'specd.local.yaml')

      const loader = new FsConfigLoader({ startDir: tmpDir })
      const result = await loader.resolvePath()

      expect(result).toBe(path.join(tmpDir, 'specd.local.yaml'))
    })

    it('given forced mode, returns resolved absolute path even when file does not exist', async () => {
      const nonExistent = path.join(tmpDir, 'custom', 'specd.yaml')

      const loader = new FsConfigLoader({ configPath: nonExistent })
      const result = await loader.resolvePath()

      expect(result).toBe(nonExistent)
    })

    it('given forced mode with relative path, returns resolved absolute path', async () => {
      const loader = new FsConfigLoader({ configPath: './specd.yaml' })
      const result = await loader.resolvePath()

      expect(result).toBe(path.resolve('./specd.yaml'))
    })

    it('never throws regardless of filesystem state', async () => {
      const loader = new FsConfigLoader({ startDir: path.join(tmpDir, 'nonexistent', 'deep') })

      await expect(loader.resolvePath()).resolves.not.toThrow()
    })
  })

  describe('Requirement: Default schemasPath for default workspace', () => {
    it('defaults schemasPath to .specd/schemas when no schemas section is configured', async () => {
      const configPath = await writeConfig(minimalYaml())

      const loader = new FsConfigLoader({ configPath })
      const config = await loader.load()

      const defaultWs = config.workspaces.find((ws) => ws.name === 'default')
      expect(defaultWs).toBeDefined()
      expect(defaultWs!.schemasPath).toBe(path.join(tmpDir, '.specd/schemas'))
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

      const loader = new FsConfigLoader({ configPath })
      const config = await loader.load()

      const defaultWs = config.workspaces.find((w) => w.name === 'default')
      expect(defaultWs?.graph).toBeDefined()
      expect(defaultWs?.graph?.respectGitignore).toBe(false)
      expect(defaultWs?.graph?.excludePaths).toEqual(['dist/', '!dist/keep/'])
    })

    it('graph field is undefined on workspace when graph block is absent', async () => {
      const configPath = await writeConfig(minimalYaml())

      const loader = new FsConfigLoader({ configPath })
      const config = await loader.load()

      const defaultWs = config.workspaces.find((w) => w.name === 'default')
      expect(defaultWs?.graph).toBeUndefined()
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

      const loader = new FsConfigLoader({ configPath })
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

      const loader = new FsConfigLoader({ configPath })
      await expect(loader.load()).rejects.toThrow(/workspaces\.default\.graph\.excludePaths/)
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

      const loader = new FsConfigLoader({ configPath })
      await expect(loader.load()).rejects.toThrow(/workspaces\.default\.graph/)
    })
  })
})
