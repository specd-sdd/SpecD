import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execSync } from 'node:child_process'
import { CommanderError } from 'commander'
import {
  makeMockConfig,
  makeMockKernel,
  makeMockChange,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
  ExitSentinel,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { createCliKernel } from '../../src/kernel.js'
import { registerChangeCreate } from '../../src/commands/change/create.js'
import { ChangeAlreadyExistsError, type Kernel, type SpecdConfig } from '@specd/core'

function setup(configOverrides: Record<string, unknown> = {}) {
  const config = makeMockConfig(configOverrides)
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({ config, configFilePath: null, kernel })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('Command signature', () => {
  it('Missing name argument', async () => {
    setup()

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await expect(program.parseAsync(['node', 'specd', 'change', 'create'])).rejects.toThrow(
      CommanderError,
    )
  })

  it('No --spec flag creates change with empty specIds', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.create.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting', specIds: [] }),
      changePath: '/tmp/test-changes/my-change',
    })

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'create', 'my-change'])

    expect(kernel.changes.create.execute).toHaveBeenCalledWith(
      expect.objectContaining({ specIds: [] }),
    )
    expect(kernel.changes.create.execute).toHaveBeenCalledWith(
      expect.not.objectContaining({ includeOverlapCheck: true }),
    )
    expect(stdout()).toContain('created change my-change')
  })
})

describe('Workspace resolution', () => {
  it('Workspace prefix omitted defaults to default', async () => {
    const { kernel } = setup()
    kernel.changes.create.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      changePath: '/tmp/test-changes/my-change',
    })

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'create',
      'my-change',
      '--spec',
      'auth/login',
    ])

    expect(kernel.changes.create.execute).toHaveBeenCalledWith(
      expect.objectContaining({ specIds: ['default:auth/login'] }),
    )
  })

  it('Explicit workspace prefix used', async () => {
    const { kernel, stdout } = setup({
      workspaces: [
        {
          name: 'default',
          specsPath: '/project/specs',
          schemasPath: null,
          codeRoot: '/project',
          ownership: 'owned' as const,
          isExternal: false,
        },
        {
          name: 'billing-ws',
          specsPath: '/project/billing/specs',
          schemasPath: null,
          codeRoot: '/project/billing',
          ownership: 'owned' as const,
          isExternal: false,
        },
      ],
    })
    kernel.changes.create.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      changePath: '/tmp/test-changes/my-change',
    })

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'create',
      'my-change',
      '--spec',
      'billing-ws:invoices',
    ])

    expect(kernel.changes.create.execute).toHaveBeenCalledWith(
      expect.objectContaining({ specIds: ['billing-ws:invoices'] }),
    )
    expect(stdout()).toContain('created change my-change')
  })

  it('Unknown workspace prefix', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program
      .parseAsync([
        'node',
        'specd',
        'change',
        'create',
        'my-change',
        '--spec',
        'nonexistent-ws:some/path',
      ])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })
})

describe('Output on success', () => {
  it('Successful creation', async () => {
    const { kernel, stdout, stderr } = setup()
    kernel.changes.create.execute.mockResolvedValue({
      change: makeMockChange({ name: 'add-login', state: 'drafting' }),
      changePath: '/tmp/test-changes/add-login',
    })

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'create',
      'add-login',
      '--spec',
      'auth/login',
    ])

    expect(stdout()).toContain('created change add-login')
    expect(stderr()).toBe('')
  })

  it('JSON output on success', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.create.execute.mockResolvedValue({
      change: makeMockChange({ name: 'add-login', state: 'drafting' }),
      changePath: '/tmp/test-changes/add-login',
    })

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'create',
      'add-login',
      '--spec',
      'auth/login',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(parsed.state).toBe('drafting')
    expect(parsed.name).toBe('add-login')
    expect(parsed.changePath).toBe('/tmp/test-changes/add-login')
  })
})

describe('Duplicate name error', () => {
  it('Name already exists', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.create.execute.mockRejectedValue(new ChangeAlreadyExistsError('my-change'))

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'create', 'my-change', '--spec', 'auth/login'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })
})

describe('Schema resolution delegation', () => {
  it('does not call getActiveSchema in the CLI handler', async () => {
    const { kernel } = setup()
    kernel.changes.create.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      changePath: '/tmp/test-changes/my-change',
    })

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'create', 'my-change'])

    expect(kernel.specs.getActiveSchema.execute).not.toHaveBeenCalled()
    expect(kernel.changes.create.execute).toHaveBeenCalledWith(
      expect.not.objectContaining({
        schemaName: expect.anything(),
        schemaVersion: expect.anything(),
      }),
    )
  })

  it('passes includeOverlapCheck when specs are present', async () => {
    const { kernel } = setup()
    kernel.changes.create.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      changePath: '/tmp/test-changes/my-change',
    })

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'create',
      'my-change',
      '--spec',
      'auth/login',
    ])

    expect(kernel.changes.create.execute).toHaveBeenCalledWith(
      expect.objectContaining({ includeOverlapCheck: true }),
    )
    expect(kernel.changes.detectOverlap.execute).not.toHaveBeenCalled()
  })
})

describe('Overlap warning delegation', () => {
  it('emits stderr warning from create result overlapReport', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.create.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      changePath: '/tmp/test-changes/my-change',
      overlapReport: {
        hasOverlap: true,
        entries: [
          {
            specId: 'default:auth/login',
            changes: [{ name: 'other-change', state: 'designing' }],
          },
        ],
      },
    })

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'create',
      'my-change',
      '--spec',
      'auth/login',
    ])

    expect(stderr()).toContain('warning: spec overlap detected')
    expect(kernel.changes.detectOverlap.execute).not.toHaveBeenCalled()
  })
})

describe('ReadOnly workspace rejection', () => {
  it('rejects --spec targeting readOnly workspace', async () => {
    const { kernel, stderr } = setup({
      workspaces: [
        {
          name: 'default',
          specsPath: '/project/specs',
          schemasPath: null,
          codeRoot: '/project',
          ownership: 'owned' as const,
          isExternal: false,
        },
        {
          name: 'platform',
          specsPath: '/external/platform/specs',
          schemasPath: null,
          codeRoot: '/external/platform',
          ownership: 'readOnly' as const,
          isExternal: true,
        },
      ],
    })

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program
      .parseAsync([
        'node',
        'specd',
        'change',
        'create',
        'my-change',
        '--spec',
        'platform:auth/tokens',
      ])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('workspace "platform" is readOnly')
    expect(kernel.changes.create.execute).not.toHaveBeenCalled()
  })
})

describe('Integration (real kernel)', () => {
  let tmpDir: string
  let config: SpecdConfig
  let kernel: Kernel

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-change-create-int-'))
    const specsPath = path.join(tmpDir, 'specs')
    const changesPath = path.join(tmpDir, '.specd', 'changes')
    const draftsPath = path.join(tmpDir, '.specd', 'drafts')
    const discardedPath = path.join(tmpDir, '.specd', 'discarded')
    const archivePath = path.join(tmpDir, '.specd', 'archive')
    await Promise.all([
      fs.mkdir(specsPath, { recursive: true }),
      fs.mkdir(changesPath, { recursive: true }),
      fs.mkdir(draftsPath, { recursive: true }),
      fs.mkdir(discardedPath, { recursive: true }),
      fs.mkdir(archivePath, { recursive: true }),
    ])
    execSync('git init', { cwd: tmpDir })
    execSync('git config user.email test@example.com', { cwd: tmpDir })
    execSync('git config user.name Test User', { cwd: tmpDir })
    config = {
      projectRoot: tmpDir,
      configPath: path.join(tmpDir, 'specd.yaml'),
      schemaRef: '@specd/schema-std',
      workspaces: [
        {
          name: 'default',
          specsPath,
          specsAdapter: { adapter: 'fs', config: { path: specsPath } },
          schemasPath: null,
          schemasAdapter: null,
          codeRoot: tmpDir,
          ownership: 'owned',
          isExternal: false,
        },
      ],
      storage: {
        changesPath,
        changesAdapter: { adapter: 'fs', config: { path: changesPath } },
        draftsPath,
        draftsAdapter: { adapter: 'fs', config: { path: draftsPath } },
        discardedPath,
        discardedAdapter: { adapter: 'fs', config: { path: discardedPath } },
        archivePath,
        archiveAdapter: { adapter: 'fs', config: { path: archivePath } },
      },
      approvals: { spec: false, signoff: false },
    }
    kernel = await createCliKernel(config)
    vi.mocked(resolveCliContext).mockResolvedValue({
      config,
      configFilePath: config.configPath,
      kernel,
    })
    mockProcessExit()
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('persists effective schema identity on manifest without CLI schema prelude', async () => {
    const executeSpy = vi.spyOn(kernel.changes.create, 'execute')
    const stdout = captureStdout()

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'create', 'my-change', '--format', 'json'])

    expect(executeSpy).toHaveBeenCalledWith(
      expect.not.objectContaining({
        schemaName: expect.anything(),
        schemaVersion: expect.anything(),
      }),
    )

    const parsed = JSON.parse(stdout()) as { result: string; changePath: string }
    expect(parsed.result).toBe('ok')

    const manifest = JSON.parse(
      await fs.readFile(path.join(parsed.changePath, 'manifest.json'), 'utf8'),
    ) as {
      schema: { name: string; version: number }
      history: Array<{ type: string; schemaName?: string; schemaVersion?: number }>
    }

    expect(manifest.schema).toEqual({ name: 'schema-std', version: 1 })
    const created = manifest.history.find((event) => event.type === 'created')
    expect(created?.schemaName).toBe('schema-std')
    expect(created?.schemaVersion).toBe(1)
  })

  it('emits overlap warning from real DetectOverlap when another change targets the spec', async () => {
    await kernel.changes.create.execute({
      name: 'existing-change',
      specIds: ['default:auth/login'],
      includeOverlapCheck: false,
    })

    const stdout = captureStdout()
    const stderr = captureStderr()

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'create',
      'my-change',
      '--spec',
      'auth/login',
    ])

    expect(stderr()).toContain('warning: spec overlap detected')
    expect(stderr()).toContain('existing-change')
    expect(stdout()).toContain('created change my-change')
  })
})
