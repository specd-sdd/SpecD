/* eslint-disable @typescript-eslint/unbound-method */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { ChangeNotFoundError } from '@specd/core'
import {
  makeMockConfig,
  makeMockChange,
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
import { registerChangeArtifacts } from '../../src/commands/change/artifacts.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({ config, configFilePath: null, kernel })
  // Default: schema resolution returns no artifacts (skip delta enrichment)
  kernel.specs.getActiveSchema.execute.mockResolvedValue({
    raw: false,
    schema: {
      name: () => 'test',
      version: () => 1,
      artifacts: () => [],
      workflow: () => [],
    },
  })
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
      change: makeMockChange({ name: 'my-change' }),
      artifactStatuses: [
        {
          type: 'proposal',
          state: 'complete',
          effectiveStatus: 'complete',
          files: [{ key: 'proposal', filename: 'proposal.md', state: 'complete' }],
        },
        {
          type: 'spec',
          state: 'missing',
          effectiveStatus: 'missing',
          files: [{ key: 'spec', filename: 'spec.md', state: 'missing' }],
        },
      ],
      lifecycle: { changePath: '/project/.specd/changes/my-change' },
    })
    vi.mocked(kernel.changes.repo.artifactExists)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

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
      change: makeMockChange({ name: 'my-change' }),
      artifactStatuses: [
        {
          type: 'proposal',
          state: 'missing',
          effectiveStatus: 'missing',
          files: [{ key: 'proposal', filename: 'proposal.md', state: 'missing' }],
        },
        {
          type: 'spec',
          state: 'missing',
          effectiveStatus: 'missing',
          files: [{ key: 'spec', filename: 'spec.md', state: 'missing' }],
        },
        {
          type: 'tasks',
          state: 'missing',
          effectiveStatus: 'missing',
          files: [{ key: 'tasks', filename: 'tasks.md', state: 'missing' }],
        },
      ],
      lifecycle: { changePath: '/project/.specd/changes/my-change' },
    })
    vi.mocked(kernel.changes.repo.artifactExists).mockResolvedValue(false)

    const program = makeProgram()
    registerChangeArtifacts(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'artifacts', 'my-change'])

    const out = stdout()
    expect(out).toContain('proposal')
    expect(out).toContain('spec')
    expect(out).toContain('tasks')
  })

  it('outputs JSON with name and artifacts array', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change' }),
      artifactStatuses: [
        {
          type: 'proposal',
          state: 'complete',
          effectiveStatus: 'complete',
          files: [{ key: 'proposal', filename: 'proposal.md', state: 'complete' }],
        },
      ],
      lifecycle: { changePath: '/project/.specd/changes/my-change' },
    })
    vi.mocked(kernel.changes.repo.artifactExists).mockResolvedValue(true)

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
    expect(Array.isArray(parsed.artifacts)).toBe(true)
    expect(parsed.artifacts[0].id).toBe('proposal')
    expect(parsed.artifacts[0].artifactState).toBe('complete')
    expect(parsed.artifacts[0].fileState).toBe('complete')
    expect(parsed.artifacts[0].exists).toBe(true)
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
      change: makeMockChange({ name: 'my-change' }),
      artifactStatuses: [
        {
          type: 'proposal',
          state: 'complete',
          effectiveStatus: 'complete',
          files: [{ key: 'proposal', filename: 'proposal.md', state: 'complete' }],
        },
      ],
      lifecycle: { changePath: '/project/.specd/changes/my-change' },
    })
    vi.mocked(kernel.changes.repo.artifactExists).mockResolvedValue(true)

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
