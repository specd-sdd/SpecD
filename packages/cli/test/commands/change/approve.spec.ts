import { describe, it, expect, vi, afterEach } from 'vitest'
import { ChangeNotFoundError, ApprovalGateDisabledError } from '@specd/sdk'
import {
  makeMockConfig,
  makeMockChange,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from '../helpers.js'

vi.mock('../../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
  buildCliKernelOptions: vi.fn(() => ({})),
}))

import { resolveCliContext } from '../../../src/helpers/cli-context.js'
import { registerChangeApprove } from '../../../src/commands/change/approve.js'

function setup() {
  const config = makeMockConfig({ approvals: { spec: true, signoff: true } })
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({
    config: config,
    configFilePath: null,
    kernel: kernel,
  })
  kernel.changes.status.execute.mockResolvedValue({
    change: makeMockChange({ name: 'my-change', state: 'ready' }),
    artifactStatuses: [],
    specDependsOn: {},
    implementationTracking: { trackedFiles: [], links: [] },
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
    kernel.changes.approveSpec.execute.mockResolvedValue(undefined)

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

    expect(kernel.changes.approveSpec.execute).toHaveBeenCalledWith({
      name: 'my-change',
      reason: 'looks good',
    })
    expect(stdout()).toContain('approved spec for my-change')
    expect(stdout()).not.toContain('pending-spec-approval')
    expect(stdout()).not.toContain('moved')
  })

  it('records spec approval from ready without requiring pending-spec-approval', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'ready' }),
      artifactStatuses: [],
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
    })
    kernel.changes.approveSpec.execute.mockResolvedValue(
      makeMockChange({ name: 'my-change', state: 'ready' }),
    )

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

    expect(kernel.changes.approveSpec.execute).toHaveBeenCalledWith({
      name: 'my-change',
      reason: 'looks good',
    })
    expect(stdout()).toContain('approved spec for my-change')
    expect(stdout()).not.toContain('pending')
  })

  it('still allows drain spec approval from pending-spec-approval', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'pending-spec-approval' }),
      artifactStatuses: [],
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
    })
    kernel.changes.approveSpec.execute.mockResolvedValue(
      makeMockChange({ name: 'my-change', state: 'spec-approved' }),
    )

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
      'drain',
    ])

    expect(kernel.changes.approveSpec.execute).toHaveBeenCalled()
    expect(stdout()).toContain('approved spec for my-change')
    expect(stdout()).not.toContain('moved to pending')
  })

  it('outputs JSON on successful spec approval', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.approveSpec.execute.mockResolvedValue(undefined)

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
    kernel.changes.approveSpec.execute.mockRejectedValue(new ChangeNotFoundError('nonexistent'))

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
    kernel.changes.approveSpec.execute.mockRejectedValue(new ApprovalGateDisabledError('spec'))

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
    kernel.changes.approveSignoff.execute.mockResolvedValue(undefined)

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

    expect(kernel.changes.approveSignoff.execute).toHaveBeenCalledWith({
      name: 'my-change',
      reason: 'done',
    })
    expect(stdout()).toContain('approved signoff for my-change')
    expect(stdout()).not.toContain('pending-signoff')
    expect(stdout()).not.toContain('moved')
  })

  it('records signoff from done without requiring pending-signoff', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'done' }),
      artifactStatuses: [],
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
    })
    kernel.changes.approveSignoff.execute.mockResolvedValue(
      makeMockChange({ name: 'my-change', state: 'done' }),
    )

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

    expect(kernel.changes.approveSignoff.execute).toHaveBeenCalledWith({
      name: 'my-change',
      reason: 'done',
    })
    expect(stdout()).toContain('approved signoff for my-change')
    expect(stdout()).not.toContain('pending')
  })

  it('still allows drain signoff from pending-signoff', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'pending-signoff' }),
      artifactStatuses: [],
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
    })
    kernel.changes.approveSignoff.execute.mockResolvedValue(
      makeMockChange({ name: 'my-change', state: 'signed-off' }),
    )

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
      'drain',
    ])

    expect(kernel.changes.approveSignoff.execute).toHaveBeenCalled()
    expect(stdout()).toContain('approved signoff for my-change')
    expect(stdout()).not.toContain('moved to pending')
  })

  it('outputs JSON on successful signoff', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.approveSignoff.execute.mockResolvedValue(undefined)

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
