import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerStorageReindex } from '../../src/commands/storage/reindex.js'

function setup(workspaces?: Array<{ name: string }>) {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  const wsList = workspaces?.map((ws) => ({
    name: ws.name,
    codeRoot: '/project',
    isExternal: false,
    ownership: 'owned' as const,
    specRepo: {
      reindex: vi.fn().mockResolvedValue(undefined),
      count: vi.fn().mockResolvedValue(0),
    },
  })) ?? [
    {
      name: 'default',
      codeRoot: '/project',
      isExternal: false,
      ownership: 'owned' as const,
      specRepo: {
        reindex: vi.fn().mockResolvedValue(undefined),
        count: vi.fn().mockResolvedValue(0),
      },
    },
    {
      name: 'billing',
      codeRoot: '/project',
      isExternal: false,
      ownership: 'owned' as const,
      specRepo: {
        reindex: vi.fn().mockResolvedValue(undefined),
        count: vi.fn().mockResolvedValue(0),
      },
    },
  ]
  kernel.project.listWorkspaces.execute.mockResolvedValue(wsList)
  vi.mocked(resolveCliContext).mockResolvedValue({ config, configFilePath: null, kernel })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr, wsList }
}

afterEach(() => vi.restoreAllMocks())

describe('storage reindex flag matrix', () => {
  it('no flags rebuilds changes, all workspace specs, and archive', async () => {
    const { kernel, wsList } = setup()

    const program = makeProgram()
    registerStorageReindex(program.command('storage'))
    await program.parseAsync(['node', 'specd', 'storage', 'reindex'])

    expect(kernel.changes.repo.reindex).toHaveBeenCalledTimes(1)
    expect(kernel.changes.archiveRepo.reindex).toHaveBeenCalledTimes(1)
    for (const ws of wsList) {
      expect(ws.specRepo.reindex).toHaveBeenCalledTimes(1)
    }
  })

  it('--changes rebuilds change indexes only', async () => {
    const { kernel, wsList } = setup()

    const program = makeProgram()
    registerStorageReindex(program.command('storage'))
    await program.parseAsync(['node', 'specd', 'storage', 'reindex', '--changes'])

    expect(kernel.changes.repo.reindex).toHaveBeenCalledTimes(1)
    expect(kernel.changes.archiveRepo.reindex).not.toHaveBeenCalled()
    for (const ws of wsList) {
      expect(ws.specRepo.reindex).not.toHaveBeenCalled()
    }
  })

  it('--specs rebuilds spec indexes for each workspace only', async () => {
    const { kernel, wsList } = setup()

    const program = makeProgram()
    registerStorageReindex(program.command('storage'))
    await program.parseAsync(['node', 'specd', 'storage', 'reindex', '--specs'])

    expect(kernel.changes.repo.reindex).not.toHaveBeenCalled()
    expect(kernel.changes.archiveRepo.reindex).not.toHaveBeenCalled()
    for (const ws of wsList) {
      expect(ws.specRepo.reindex).toHaveBeenCalledTimes(1)
    }
  })

  it('--archive rebuilds archive index only', async () => {
    const { kernel, wsList } = setup()

    const program = makeProgram()
    registerStorageReindex(program.command('storage'))
    await program.parseAsync(['node', 'specd', 'storage', 'reindex', '--archive'])

    expect(kernel.changes.archiveRepo.reindex).toHaveBeenCalledTimes(1)
    expect(kernel.changes.repo.reindex).not.toHaveBeenCalled()
    for (const ws of wsList) {
      expect(ws.specRepo.reindex).not.toHaveBeenCalled()
    }
  })

  it('--changes and --specs are combinable without archive', async () => {
    const { kernel, wsList } = setup()

    const program = makeProgram()
    registerStorageReindex(program.command('storage'))
    await program.parseAsync(['node', 'specd', 'storage', 'reindex', '--changes', '--specs'])

    expect(kernel.changes.repo.reindex).toHaveBeenCalledTimes(1)
    expect(kernel.changes.archiveRepo.reindex).not.toHaveBeenCalled()
    for (const ws of wsList) {
      expect(ws.specRepo.reindex).toHaveBeenCalledTimes(1)
    }
  })

  it('--changes and --archive are combinable without specs', async () => {
    const { kernel, wsList, stdout } = setup()

    const program = makeProgram()
    registerStorageReindex(program.command('storage'))
    await program.parseAsync(['node', 'specd', 'storage', 'reindex', '--changes', '--archive'])

    expect(kernel.changes.repo.reindex).toHaveBeenCalledTimes(1)
    expect(kernel.changes.archiveRepo.reindex).toHaveBeenCalledTimes(1)
    for (const ws of wsList) {
      expect(ws.specRepo.reindex).not.toHaveBeenCalled()
    }
    const out = stdout()
    expect(out).toContain('reindexed changes')
    expect(out).toContain('reindexed archive')
    expect(out).not.toContain('reindexed specs')
  })
})

describe('storage reindex output', () => {
  it('text output lists every rebuilt target when rebuilding all', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerStorageReindex(program.command('storage'))
    await program.parseAsync(['node', 'specd', 'storage', 'reindex'])

    const out = stdout()
    expect(out).toContain('reindexed changes')
    expect(out).toContain('reindexed specs (default)')
    expect(out).toContain('reindexed specs (billing)')
    expect(out).toContain('reindexed archive')
  })

  it('JSON output reflects rebuilt targets', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerStorageReindex(program.command('storage'))
    await program.parseAsync(['node', 'specd', 'storage', 'reindex', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.reindexed.changes).toBe(true)
    expect(parsed.reindexed.specs).toEqual(['default', 'billing'])
    expect(parsed.reindexed.archive).toBe(true)
  })

  it('JSON output omits targets not rebuilt', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerStorageReindex(program.command('storage'))
    await program.parseAsync([
      'node',
      'specd',
      'storage',
      'reindex',
      '--changes',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.reindexed.changes).toBe(true)
    expect(parsed.reindexed.specs).toBeUndefined()
    expect(parsed.reindexed.archive).toBeUndefined()
  })

  it('spec reindex with no workspaces produces no spec lines', async () => {
    const { kernel, stdout } = setup([])
    kernel.project.listWorkspaces.execute.mockResolvedValue([])

    const program = makeProgram()
    registerStorageReindex(program.command('storage'))
    await program.parseAsync(['node', 'specd', 'storage', 'reindex', '--specs', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.reindexed.specs).toEqual([])
    expect(stdout()).not.toContain('reindexed specs')
  })
})

describe('storage reindex errors', () => {
  it('reindex failure exits code 3', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.archiveRepo.reindex = vi.fn().mockRejectedValue(new Error('disk full'))

    const program = makeProgram()
    registerStorageReindex(program.command('storage'))
    await program.parseAsync(['node', 'specd', 'storage', 'reindex', '--archive']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(3)
    expect(stderr()).toMatch(/fatal:/)
  })
})
