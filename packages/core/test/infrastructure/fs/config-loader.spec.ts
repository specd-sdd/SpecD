import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FsConfigLoader } from '../../../src/infrastructure/fs/config-loader.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-config-loader-test-'))
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

  describe('Requirement: Storage paths must remain within repo root', () => {
    it('throws ConfigValidationError when a storage path resolves outside the git root', async () => {
      // Create a fake git repo so findGitRoot returns tmpDir
      await fs.mkdir(path.join(tmpDir, '.git'), { recursive: true })

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

    it('accepts storage paths that are within the git root', async () => {
      await fs.mkdir(path.join(tmpDir, '.git'), { recursive: true })

      const configPath = await writeConfig(minimalYaml())
      const loader = new FsConfigLoader({ configPath })
      const config = await loader.load()

      expect(config.storage.changesPath).toContain('.specd')
    })
  })
})
