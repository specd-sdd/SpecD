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

  it('reloads and renders canonical state after an approval failure', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.approveSpec.execute.mockRejectedValue(new ApprovalGateDisabledError('spec'))
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'designing' }),
      artifactStatuses: [],
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
      blockers: [{ code: 'APPROVAL_STALE', message: 'Spec approval is stale' }],
      nextAction: {
        targetStep: 'designing',
        actionType: 'cognitive',
        reason: 'Renew design consent',
        command: '/specd-design',
      },
    })
    const program = makeProgram()
    registerChangeApprove(program.command('change'))

    await program
      .parseAsync(['node', 'specd', 'change', 'approve', 'spec', 'my-change', '--reason', 'ok'])
      .catch(() => {})

    expect(kernel.changes.status.execute).toHaveBeenCalledWith({ name: 'my-change' })
    expect(stderr()).toContain('state: designing')
    expect(stderr()).toContain('blocker: APPROVAL_STALE')
    expect(stderr()).toContain('next action: /specd-design')
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

  it('renders empty observed implementation separately from legacy unknown evidence', async () => {
    const hash = 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
    const { kernel, stdout } = setup()
    kernel.changes.approveSignoff.execute.mockResolvedValue({
      name: 'my-change',
      state: 'done',
      signoff: {
        status: 'valid',
        decision: {
          at: new Date('2026-09-22T12:00:00.000Z'),
          by: { name: 'Ada', email: 'ada@example.com' },
          reason: 'done',
        },
        verificationId: 'verification-3',
        fingerprint: {
          version: 1,
          artifacts: {
            algorithm: 'artifact-pre-hash-v1',
            files: { 'spec:login': hash },
          },
          implementation: {
            version: 1,
            hashAlgorithm: 'sha256',
            textNormalization: 'text-v1',
            binaryNormalization: 'bytes-v1',
            files: {},
          },
        },
      },
    })

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

    const out = stdout()
    expect(out).toContain('status:      valid')
    expect(out).toContain('verification: verification-3')
    expect(out).toContain('observed empty')
    expect(out).toContain('text-v1')
    expect(out).not.toContain(hash)
    expect(out).not.toContain('legacy unknown')
  })

  it('labels a null implementation fingerprint as legacy unknown', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.approveSignoff.execute.mockResolvedValue({
      name: 'my-change',
      state: 'done',
      signoff: {
        status: 'valid',
        decision: {
          at: '2026-09-22T12:00:00.000Z',
          by: { name: 'Ada', email: 'ada@example.com' },
          reason: 'done',
        },
        verificationId: null,
        fingerprint: {
          version: 1,
          artifacts: { algorithm: 'artifact-pre-hash-v1', files: {} },
          implementation: null,
        },
      },
    })

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

    expect(stdout()).toContain('implementation: legacy unknown')
    expect(stdout()).toContain('verification: legacy unknown')
  })
})

describe('change approve spec evidence', () => {
  it('renders materialized spec approval without file hashes', async () => {
    const hash = 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
    const { kernel, stdout } = setup()
    kernel.changes.approveSpec.execute.mockResolvedValue({
      name: 'my-change',
      state: 'ready',
      specApproval: {
        status: 'valid',
        decision: {
          at: '2026-09-22T12:00:00.000Z',
          by: { name: 'Ada', email: 'ada@example.com' },
          reason: 'looks good',
        },
        fingerprint: {
          version: 1,
          algorithm: 'artifact-pre-hash-v1',
          files: { 'spec:login': hash },
        },
      },
    })

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

    const parsed = JSON.parse(stdout()) as {
      approval: {
        status: string
        fingerprint: { artifacts: { fileCount: number }; implementation?: unknown }
      }
    }
    expect(parsed.approval.status).toBe('valid')
    expect(parsed.approval.fingerprint.artifacts.fileCount).toBe(1)
    expect(parsed.approval.fingerprint.implementation).toBeUndefined()
    expect(stdout()).not.toContain(hash)
  })
})
