/* eslint-disable @typescript-eslint/unbound-method */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { ChangeNotFoundError, ApprovalGateDisabledError } from '@specd/core'
import {
  makeMockConfig,
  makeMockChange,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from './helpers.js'

vi.mock('../../src/load-config.js', () => ({ loadConfig: vi.fn() }))
vi.mock('../../src/kernel.js', () => ({ createCliKernel: vi.fn() }))

import { loadConfig } from '../../src/load-config.js'
import { createCliKernel } from '../../src/kernel.js'
import { registerChangeApprove } from '../../src/commands/change/approve.js'

function setup() {
  const config = makeMockConfig({ approvals: { spec: true, signoff: true } })
  const kernel = makeMockKernel()
  vi.mocked(loadConfig).mockResolvedValue(config)
  vi.mocked(createCliKernel).mockResolvedValue(kernel)
  kernel.changes.status.execute.mockResolvedValue({
    change: makeMockChange({ name: 'my-change', state: 'pending-spec-approval' }),
    artifactStatuses: [],
  })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

// ---------------------------------------------------------------------------
// approve spec
// ---------------------------------------------------------------------------

describe('change approve spec', () => {
  it('prints confirmation on successful spec approval', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.approveSpec.execute.mockResolvedValue(undefined)

    const program = makeProgram()
    registerChangeApprove(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'approve',
      'spec',
      'my-change',
      '--reason',
      'looks good',
    ])

    expect(stdout()).toContain('approved spec for my-change')
  })

  it('outputs JSON on successful spec approval', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.approveSpec.execute.mockResolvedValue(undefined)

    const program = makeProgram()
    registerChangeApprove(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'approve',
      'spec',
      'my-change',
      '--reason',
      'looks good',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(parsed.gate).toBe('spec')
    expect(parsed.name).toBe('my-change')
  })

  it('exits with error when --reason is missing', async () => {
    setup()

    const program = makeProgram()
    registerChangeApprove(program.command('change'))
    await expect(
      program.parseAsync(['node', 'specd', 'change', 'approve', 'spec', 'my-change']),
    ).rejects.toThrow()
  })

  it('exits 1 when change not found', async () => {
    const { kernel, stderr } = setup()
    kernel.specs.approveSpec.execute.mockRejectedValue(new ChangeNotFoundError('nonexistent'))

    const program = makeProgram()
    registerChangeApprove(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'approve', 'spec', 'nonexistent', '--reason', 'ok'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('exits 1 when change is in wrong state for spec approval', async () => {
    const { kernel, stderr } = setup()
    kernel.specs.approveSpec.execute.mockRejectedValue(new ApprovalGateDisabledError('spec'))

    const program = makeProgram()
    registerChangeApprove(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'approve', 'spec', 'my-change', '--reason', 'ok'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })
})

// ---------------------------------------------------------------------------
// approve — unknown sub-verb
// ---------------------------------------------------------------------------

describe('change approve — unknown sub-verb', () => {
  it('rejects unknown sub-verb', async () => {
    setup()

    const program = makeProgram()
    registerChangeApprove(program.command('change'))

    await expect(
      program.parseAsync([
        'node',
        'specd',
        'change',
        'approve',
        'review',
        'my-change',
        '--reason',
        'ok',
      ]),
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// approve signoff
// ---------------------------------------------------------------------------

describe('change approve signoff', () => {
  it('prints confirmation on successful signoff', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.approveSignoff.execute.mockResolvedValue(undefined)

    const program = makeProgram()
    registerChangeApprove(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'approve',
      'signoff',
      'my-change',
      '--reason',
      'done',
    ])

    expect(stdout()).toContain('approved signoff for my-change')
  })

  it('outputs JSON on successful signoff', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.approveSignoff.execute.mockResolvedValue(undefined)

    const program = makeProgram()
    registerChangeApprove(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'approve',
      'signoff',
      'my-change',
      '--reason',
      'done',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(parsed.gate).toBe('signoff')
    expect(parsed.name).toBe('my-change')
  })
})
