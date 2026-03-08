/* eslint-disable @typescript-eslint/unbound-method */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { ChangeNotFoundError } from '@specd/core'
import {
  makeMockConfig,
  makeMockChange,
  makeMockKernel,
  makeMockStats,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from './helpers.js'

vi.mock('../../src/load-config.js', () => ({ loadConfig: vi.fn() }))
vi.mock('../../src/kernel.js', () => ({ createCliKernel: vi.fn() }))
vi.mock('../../src/helpers/change-dir.js', () => ({ findChangeDir: vi.fn() }))
vi.mock('node:fs/promises', () => ({
  stat: vi.fn(),
}))

import { loadConfig } from '../../src/load-config.js'
import { createCliKernel } from '../../src/kernel.js'
import { findChangeDir } from '../../src/helpers/change-dir.js'
import { stat } from 'node:fs/promises'
import { registerChangeArtifacts } from '../../src/commands/change/artifacts.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(loadConfig).mockResolvedValue(config)
  vi.mocked(createCliKernel).mockReturnValue(kernel)
  vi.mocked(findChangeDir).mockResolvedValue('/project/.specd/changes/20260115-100000-my-change')
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('change artifacts', () => {
  it('prints text output with columns', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({
        name: 'my-change',
        artifacts: new Map([
          ['proposal', { filename: 'proposal.md' }],
          ['spec', { filename: 'spec.md' }],
        ]),
      }),
      artifactStatuses: [
        { type: 'proposal', effectiveStatus: 'complete' },
        { type: 'spec', effectiveStatus: 'missing' },
      ],
    })
    vi.mocked(stat)
      .mockResolvedValueOnce(makeMockStats())
      .mockRejectedValueOnce(new Error('ENOENT'))

    const program = makeProgram()
    registerChangeArtifacts(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'artifacts', 'my-change'])

    const out = stdout()
    expect(out).toContain('proposal')
    expect(out).toContain('complete')
    expect(out).toContain('yes')
    expect(out).toContain('spec')
    expect(out).toContain('missing')
    expect(out).toContain('no')
  })

  it('lists all artifacts regardless of disk existence', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({
        name: 'my-change',
        artifacts: new Map([
          ['proposal', { filename: 'proposal.md' }],
          ['spec', { filename: 'spec.md' }],
          ['tasks', { filename: 'tasks.md' }],
        ]),
      }),
      artifactStatuses: [
        { type: 'proposal', effectiveStatus: 'missing' },
        { type: 'spec', effectiveStatus: 'missing' },
        { type: 'tasks', effectiveStatus: 'missing' },
      ],
    })
    vi.mocked(stat).mockRejectedValue(new Error('ENOENT'))

    const program = makeProgram()
    registerChangeArtifacts(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'artifacts', 'my-change'])

    const out = stdout()
    expect(out).toContain('proposal')
    expect(out).toContain('spec')
    expect(out).toContain('tasks')
  })

  it('outputs JSON with name, changeDir, and artifacts array', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({
        name: 'my-change',
        artifacts: new Map([['proposal', { filename: 'proposal.md' }]]),
      }),
      artifactStatuses: [{ type: 'proposal', effectiveStatus: 'complete' }],
    })
    vi.mocked(stat).mockResolvedValue(makeMockStats())

    const program = makeProgram()
    registerChangeArtifacts(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'artifacts',
      'my-change',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.name).toBe('my-change')
    expect(typeof parsed.changeDir).toBe('string')
    expect(Array.isArray(parsed.artifacts)).toBe(true)
    expect(parsed.artifacts[0].id).toBe('proposal')
    expect(parsed.artifacts[0].effectiveStatus).toBe('complete')
    expect(parsed.artifacts[0].exists).toBe(true)
  })

  it('outputs absolute paths', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({
        name: 'my-change',
        artifacts: new Map([['spec', { filename: 'spec.md' }]]),
      }),
      artifactStatuses: [{ type: 'spec', effectiveStatus: 'missing' }],
    })
    vi.mocked(stat).mockRejectedValue(new Error('ENOENT'))

    const program = makeProgram()
    registerChangeArtifacts(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'artifacts',
      'my-change',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.artifacts[0].path.startsWith('/')).toBe(true)
    expect(parsed.changeDir.startsWith('/')).toBe(true)
  })

  it('exits 1 when name argument is missing', async () => {
    setup()

    const program = makeProgram()
    registerChangeArtifacts(program.command('change'))
    await expect(program.parseAsync(['node', 'specd', 'change', 'artifacts'])).rejects.toThrow()
  })

  it('includes filename field in JSON artifact entries', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({
        name: 'my-change',
        artifacts: new Map([['proposal', { filename: 'proposal.md' }]]),
      }),
      artifactStatuses: [{ type: 'proposal', effectiveStatus: 'complete' }],
    })
    vi.mocked(stat).mockResolvedValue(makeMockStats())

    const program = makeProgram()
    registerChangeArtifacts(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'artifacts',
      'my-change',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.artifacts[0].filename).toBe('proposal.md')
  })

  it('exits 1 when change not found', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockRejectedValue(new ChangeNotFoundError('missing'))

    const program = makeProgram()
    registerChangeArtifacts(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'artifacts', 'missing']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })
})
