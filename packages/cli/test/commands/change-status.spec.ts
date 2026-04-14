/* eslint-disable @typescript-eslint/unbound-method */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { CommanderError } from 'commander'
import {
  makeMockConfig,
  makeMockKernel,
  makeMockChange,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerChangeStatus } from '../../src/commands/change/status.js'
import { ChangeNotFoundError } from '@specd/core'

const defaultLifecycle = {
  validTransitions: ['ready', 'designing'],
  availableTransitions: [],
  blockers: [],
  approvals: { spec: false, signoff: false },
  nextArtifact: null,
  changePath: '.specd/changes/20260115-100000-my-change',
  schemaInfo: { name: '@specd/schema-std', version: 1 },
}

function setup() {
  const config = makeMockConfig()
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
    registerChangeStatus(program.command('change'))
    await expect(program.parseAsync(['node', 'specd', 'change', 'status'])).rejects.toThrow(
      CommanderError,
    )
  })
})

describe('Output format', () => {
  it('Normal status output', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({
      name: 'add-login',
      state: 'designing',
      specIds: ['auth/login'],
    })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      artifactStatuses: [
        { type: 'proposal', state: 'complete', effectiveStatus: 'complete', files: [] },
      ],
      lifecycle: { ...defaultLifecycle, nextArtifact: 'specs' },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'add-login'])

    const out = stdout()
    expect(out).toContain('change:')
    expect(out).toContain('add-login')
    expect(out).toContain('state:')
    expect(out).toContain('designing')
    expect(out).toContain('specs:')
    expect(out).toContain('auth/login')
    expect(out).toContain('proposal')
    expect(out).toContain('lifecycle:')
    expect(out).toContain('approvals:')
    expect(out).toContain('path:')
  })

  it('Effective status reflects dependency cascading', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'my-change', state: 'designing' })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      artifactStatuses: [
        { type: 'proposal', state: 'in-progress', effectiveStatus: 'in-progress', files: [] },
        { type: 'spec', state: 'in-progress', effectiveStatus: 'in-progress', files: [] },
      ],
      lifecycle: defaultLifecycle,
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

    const out = stdout()
    const lines = out.split('\n')
    const specLine = lines.find((l: string) => l.includes('spec') && !l.includes('specs:'))
    expect(specLine).toContain('in-progress')
  })

  it('Text output shows available transitions', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'my-change', state: 'designing' })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      artifactStatuses: [],
      lifecycle: { ...defaultLifecycle, availableTransitions: ['ready', 'designing'] },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

    const out = stdout()
    expect(out).toContain('transitions:')
    expect(out).toContain('ready, designing')
  })

  it('Text output omits transitions line when none available', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'my-change', state: 'designing' })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      artifactStatuses: [],
      lifecycle: { ...defaultLifecycle, availableTransitions: [] },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

    const out = stdout()
    expect(out).not.toContain('transitions:')
  })

  it('Text output shows blockers', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'my-change', state: 'designing' })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      artifactStatuses: [],
      lifecycle: {
        ...defaultLifecycle,
        blockers: [{ transition: 'ready', reason: 'requires', blocking: ['specs', 'verify'] }],
      },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

    const out = stdout()
    expect(out).toContain('blockers:')
    expect(out).toContain('ready')
    expect(out).toContain('requires')
    expect(out).toContain('specs, verify')
  })

  it('Text output shows next artifact', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'my-change', state: 'designing' })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      artifactStatuses: [],
      lifecycle: { ...defaultLifecycle, nextArtifact: 'specs' },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

    const out = stdout()
    expect(out).toContain('next artifact: specs')
  })

  it('Text output omits next artifact when all done', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'my-change', state: 'designing' })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      artifactStatuses: [],
      lifecycle: { ...defaultLifecycle, nextArtifact: null },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

    const out = stdout()
    expect(out).not.toContain('next artifact:')
  })

  it('JSON output contains lifecycle object', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({
      name: 'add-login',
      state: 'designing',
      specIds: ['auth/login'],
      schemaName: 'std',
      schemaVersion: 1,
    })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      artifactStatuses: [
        { type: 'proposal', state: 'complete', effectiveStatus: 'complete', files: [] },
      ],
      lifecycle: {
        ...defaultLifecycle,
        nextArtifact: 'specs',
        blockers: [{ transition: 'ready', reason: 'requires', blocking: ['specs'] }],
      },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'add-login', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.name).toBe('add-login')
    expect(parsed.state).toBe('designing')
    expect(parsed.lifecycle).toBeDefined()
    expect(parsed.lifecycle.validTransitions).toEqual(['ready', 'designing'])
    expect(parsed.lifecycle.availableTransitions).toEqual([])
    expect(parsed.lifecycle.blockers).toHaveLength(1)
    expect(parsed.lifecycle.blockers[0].transition).toBe('ready')
    expect(parsed.lifecycle.approvals).toEqual({ spec: false, signoff: false })
    expect(parsed.lifecycle.nextArtifact).toBe('specs')
    expect(parsed.lifecycle.changePath).toBeDefined()
    expect(parsed.lifecycle.schemaInfo).toEqual({ name: '@specd/schema-std', version: 1 })
  })
})

describe('Schema version warning', () => {
  it('Schema mismatch', async () => {
    const { kernel, stderr } = setup()
    const change = makeMockChange({
      name: 'my-change',
      state: 'designing',
      schemaName: '@specd/schema-std',
      schemaVersion: 1,
    })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      artifactStatuses: [],
      lifecycle: {
        ...defaultLifecycle,
        schemaInfo: { name: '@specd/schema-std', version: 2 },
      },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

    const err = stderr()
    expect(err).toContain('warning:')
    expect(err).toContain('@specd/schema-std@1')
    expect(err).toContain('@specd/schema-std@2')
  })
})

describe('Change not found', () => {
  it('Unknown change name', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockRejectedValue(new ChangeNotFoundError('nonexistent'))

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'nonexistent']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })
})

describe('Overlap conflict display', () => {
  it('Text output shows overlap entries for spec-overlap-conflict reason', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'overlap-change', state: 'designing' })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      artifactStatuses: [],
      lifecycle: defaultLifecycle,
      review: {
        required: true,
        route: 'designing',
        reason: 'spec-overlap-conflict',
        affectedArtifacts: [],
        overlapDetail: [
          { archivedChangeName: 'beta', overlappingSpecIds: ['core:core/config'] },
          { archivedChangeName: 'alpha', overlappingSpecIds: ['core:core/kernel'] },
        ],
      },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'overlap-change'])

    const out = stdout()
    expect(out).toContain('reason:   spec-overlap-conflict')
    expect(out).toContain('overlap:')
    expect(out).toContain('archived: beta, specs: core:core/config')
    expect(out).toContain('archived: alpha, specs: core:core/kernel')
  })

  it('JSON output includes overlapDetail array', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({
      name: 'overlap-change',
      state: 'designing',
      specIds: ['core:core/config'],
    })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      artifactStatuses: [],
      lifecycle: defaultLifecycle,
      review: {
        required: true,
        route: 'designing',
        reason: 'spec-overlap-conflict',
        affectedArtifacts: [],
        overlapDetail: [{ archivedChangeName: 'beta', overlappingSpecIds: ['core:core/config'] }],
      },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'status',
      'overlap-change',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.review.overlapDetail).toHaveLength(1)
    expect(parsed.review.overlapDetail[0].archivedChangeName).toBe('beta')
    expect(parsed.review.overlapDetail[0].overlappingSpecIds).toEqual(['core:core/config'])
  })

  it('JSON output includes empty overlapDetail for non-overlap reasons', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'no-overlap', state: 'designing' })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      artifactStatuses: [],
      lifecycle: defaultLifecycle,
      review: {
        required: false,
        route: null,
        reason: null,
        affectedArtifacts: [],
        overlapDetail: [],
      },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'status',
      'no-overlap',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.review.overlapDetail).toEqual([])
  })
})
