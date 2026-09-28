import { describe, it, expect, vi, afterEach } from 'vitest'
import { CommanderError } from 'commander'
import { decode as decodeToon } from '@toon-format/toon'
import { ChangeNotFoundError, SpecdError } from '@specd/sdk'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from '../helpers.js'

vi.mock('../../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

import { resolveCliContext } from '../../../src/helpers/cli-context.js'
import { registerChangeVerification } from '../../../src/commands/change/verification.js'

const HASH = 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'

class MismatchError extends SpecdError {
  override get code(): string {
    return 'VERIFICATION_FINGERPRINT_MISMATCH'
  }

  readonly differences = [
    {
      scope: 'implementation',
      key: 'src/login.ts',
      kind: 'changed',
      expected: HASH,
      actual: HASH,
    },
  ]

  constructor() {
    super('Verification fingerprint does not match the active attempt baseline')
  }
}

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockClear()
  vi.mocked(resolveCliContext).mockResolvedValue({ config, configFilePath: null, kernel })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

const fingerprint = {
  artifacts: { algorithm: 'artifact-pre-hash-v1', files: { 'spec:login': HASH } },
  implementation: {
    hashAlgorithm: 'sha256',
    textNormalization: 'text-v1',
    binaryNormalization: 'bytes-v1',
    files: { 'src/login.ts': { hash: HASH, content: 'export const source = true\n' } },
  },
}

describe('changes verification', () => {
  it('starts verification with one core call and no hash dump', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.startVerification.execute.mockResolvedValue({
      change: { name: 'my-change', state: 'implementing' },
      attempt: { id: 'verification-attempt-2', baseline: fingerprint },
      supersededAttemptId: 'verification-attempt-1',
      reconciliation: { automaticReturn: null, verdict: { blockers: [] }, projectionChanges: [] },
    })

    const program = makeProgram()
    registerChangeVerification(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'verification', 'start', 'my-change'])

    expect(kernel.changes.startVerification.execute).toHaveBeenCalledTimes(1)
    expect(kernel.changes.startVerification.execute).toHaveBeenCalledWith({ name: 'my-change' })
    expect(kernel.changes.completeVerification.execute).not.toHaveBeenCalled()
    expect(kernel.changes.invalidateVerification.execute).not.toHaveBeenCalled()
    expect(kernel.changes.transition.execute).not.toHaveBeenCalled()
    const out = stdout()
    expect(out).toContain('verification-attempt-2')
    expect(out).toContain('superseded: verification-attempt-1')
    expect(out).toContain('1 files (artifact-pre-hash-v1)')
    expect(out).not.toContain(HASH)
    expect(out).not.toContain('export const source')
  })

  it('completes verification once and reports the evidence id in json', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.completeVerification.execute.mockResolvedValue({
      change: { name: 'my-change', state: 'verifying' },
      verification: {
        id: 'verification-2',
        attemptId: 'verification-attempt-2',
        status: 'valid',
        fingerprint,
      },
      reconciliation: { automaticReturn: null },
    })

    const program = makeProgram()
    registerChangeVerification(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'verification',
      'complete',
      'my-change',
      '--format',
      'json',
    ])

    expect(kernel.changes.completeVerification.execute).toHaveBeenCalledTimes(1)
    expect(kernel.changes.completeVerification.execute).toHaveBeenCalledWith({ name: 'my-change' })
    expect(kernel.changes.startVerification.execute).not.toHaveBeenCalled()
    const parsed = JSON.parse(stdout()) as {
      verificationId: string
      fingerprint: { implementation: { fileCount: number; observedEmpty: boolean } }
    }
    expect(parsed.verificationId).toBe('verification-2')
    expect(parsed.fingerprint.implementation.fileCount).toBe(1)
    expect(parsed.fingerprint.implementation.observedEmpty).toBe(false)
    expect(stdout()).not.toContain(HASH)
    expect(stdout()).not.toContain('export const source')
  })

  it('requires a reason before invalidating verification', async () => {
    const { kernel } = setup()
    const program = makeProgram()
    registerChangeVerification(program.command('change'))
    await expect(
      program.parseAsync(['node', 'specd', 'change', 'verification', 'invalidate', 'my-change']),
    ).rejects.toBeInstanceOf(CommanderError)
    expect(kernel.changes.invalidateVerification.execute).not.toHaveBeenCalled()
  })

  it('rejects an empty reason before calling core', async () => {
    const { kernel, stderr } = setup()
    const program = makeProgram()
    registerChangeVerification(program.command('change'))
    await program
      .parseAsync([
        'node',
        'specd',
        'change',
        'verification',
        'invalidate',
        'my-change',
        '--reason',
        '   ',
      ])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('--reason must not be empty')
    expect(resolveCliContext).not.toHaveBeenCalled()
    expect(kernel.changes.invalidateVerification.execute).not.toHaveBeenCalled()
  })

  it.each(['start', 'complete', 'invalidate'] as const)(
    'rejects an invalid format before resolving context for %s',
    async (action) => {
      const { kernel, stderr } = setup()
      const args = ['node', 'specd', 'change', 'verification', action, 'my-change']
      if (action === 'invalidate') args.push('--reason', 'inputs changed')
      args.push('--format', 'yaml')

      const program = makeProgram()
      registerChangeVerification(program.command('change'))
      await program.parseAsync(args).catch(() => {})

      expect(process.exit).toHaveBeenCalledWith(1)
      expect(stderr()).toContain("invalid format 'yaml'")
      expect(resolveCliContext).not.toHaveBeenCalled()
      expect(kernel.changes.startVerification.execute).not.toHaveBeenCalled()
      expect(kernel.changes.completeVerification.execute).not.toHaveBeenCalled()
      expect(kernel.changes.invalidateVerification.execute).not.toHaveBeenCalled()
    },
  )

  it.each(['json', 'toon'] as const)(
    'whitelists start and complete output without invented next actions in %s',
    async (format) => {
      const { kernel, stdout } = setup()
      kernel.changes.startVerification.execute.mockResolvedValue({
        change: { name: 'my-change', state: 'implementing', privateState: 'secret' },
        attempt: { id: 'attempt-1', baseline: fingerprint, privateAttempt: 'secret' },
        supersededAttemptId: null,
        privateSentinel: 'secret',
      } as never)

      let program = makeProgram()
      registerChangeVerification(program.command('change'))
      await program.parseAsync([
        'node',
        'specd',
        'change',
        'verification',
        'start',
        'my-change',
        '--format',
        format,
      ])
      const startOutput = stdout()
      const start = (
        format === 'json' ? JSON.parse(startOutput) : decodeToon(startOutput)
      ) as Record<string, unknown>
      expect(Object.keys(start).sort()).toEqual(
        ['attemptId', 'fingerprint', 'name', 'result', 'state', 'supersededAttemptId'].sort(),
      )
      expect(start).not.toHaveProperty('nextAction')
      expect(startOutput).not.toContain('private')
      expect(startOutput).not.toContain('secret')

      vi.restoreAllMocks()
      const second = setup()
      second.kernel.changes.completeVerification.execute.mockResolvedValue({
        change: { name: 'my-change', state: 'verifying', privateState: 'secret' },
        verification: {
          id: 'verification-1',
          attemptId: 'attempt-1',
          status: 'valid',
          fingerprint,
          privateEvidence: 'secret',
        },
        privateSentinel: 'secret',
      } as never)
      program = makeProgram()
      registerChangeVerification(program.command('change'))
      await program.parseAsync([
        'node',
        'specd',
        'change',
        'verification',
        'complete',
        'my-change',
        '--format',
        format,
      ])
      const completeOutput = second.stdout()
      const complete = (
        format === 'json' ? JSON.parse(completeOutput) : decodeToon(completeOutput)
      ) as Record<string, unknown>
      expect(Object.keys(complete).sort()).toEqual(
        ['attemptId', 'fingerprint', 'name', 'result', 'state', 'status', 'verificationId'].sort(),
      )
      expect(complete).not.toHaveProperty('nextAction')
      expect(completeOutput).not.toContain('private')
      expect(completeOutput).not.toContain('secret')
    },
  )

  it.each(['json', 'toon'] as const)(
    'whitelists invalidate output and nested public projections in %s',
    async (format) => {
      const { kernel, stdout } = setup()
      kernel.changes.invalidateVerification.execute.mockResolvedValue({
        change: { name: 'my-change', state: 'done', privateState: 'secret' },
        verification: {
          id: 'verification-2',
          status: 'stale',
          fingerprint,
          privateEvidence: 'secret',
        },
        invalidated: true,
        reason: 'inputs changed',
        signoffChanged: false,
        automaticReturn: {
          cause: 'verification',
          from: 'archivable',
          to: 'done',
          privateRecovery: 'secret',
        },
        blockers: [
          {
            code: 'VERIFICATION_STALE',
            message: 'Completed verification is stale',
            privateBlocker: 'secret',
          },
        ],
        nextAction: {
          targetStep: 'done',
          actionType: 'cognitive',
          reason: 'Repeat verification',
          command: '/specd-verify',
          privateAction: 'secret',
        },
        privateSentinel: 'secret',
      } as never)

      const program = makeProgram()
      registerChangeVerification(program.command('change'))
      await program.parseAsync([
        'node',
        'specd',
        'change',
        'verification',
        'invalidate',
        'my-change',
        '--reason',
        'inputs changed',
        '--format',
        format,
      ])

      const rendered = stdout()
      const parsed = (format === 'json' ? JSON.parse(rendered) : decodeToon(rendered)) as Record<
        string,
        unknown
      >
      expect(Object.keys(parsed).sort()).toEqual(
        [
          'result',
          'invalidated',
          'reason',
          'name',
          'state',
          'verificationId',
          'verificationStatus',
          'signoffChanged',
          'automaticReturn',
          'blockers',
          'nextAction',
          'fingerprint',
        ].sort(),
      )
      expect(parsed.automaticReturn).toEqual({
        cause: 'verification',
        from: 'archivable',
        to: 'done',
      })
      expect(parsed.nextAction).toEqual({
        targetStep: 'done',
        actionType: 'cognitive',
        reason: 'Repeat verification',
        command: '/specd-verify',
      })
      expect(rendered).not.toContain('private')
      expect(rendered).not.toContain('secret')
      expect(rendered).not.toContain(HASH)
    },
  )

  it.each(['text', 'json', 'toon'] as const)(
    'reports the persisted reason for idempotent invalidation in %s',
    async (format) => {
      const { kernel, stdout } = setup()
      kernel.changes.invalidateVerification.execute.mockResolvedValue({
        change: { name: 'my-change', state: 'done' },
        verification: { id: 'verification-2', status: 'stale', fingerprint },
        invalidated: false,
        reason: 'original evidence reason',
        signoffChanged: true,
        automaticReturn: null,
        blockers: [{ code: 'VERIFICATION_STALE', message: 'Completed verification is stale' }],
        nextAction: {
          targetStep: 'done',
          actionType: 'cognitive',
          reason: 'Verification evidence is stale',
          command: '/specd-verify',
        },
      })

      const program = makeProgram()
      registerChangeVerification(program.command('change'))
      await program.parseAsync([
        'node',
        'specd',
        'change',
        'verification',
        'invalidate',
        'my-change',
        '--reason',
        'inputs changed',
        '--format',
        format,
      ])

      expect(kernel.changes.invalidateVerification.execute).toHaveBeenCalledTimes(1)
      expect(kernel.changes.invalidateVerification.execute).toHaveBeenCalledWith({
        name: 'my-change',
        reason: 'inputs changed',
      })
      expect(kernel.changes.startVerification.execute).not.toHaveBeenCalled()
      const out = stdout()
      if (format === 'json') {
        expect(JSON.parse(out)).toMatchObject({
          invalidated: false,
          reason: 'original evidence reason',
        })
      } else {
        expect(out).toContain(
          format === 'text' ? 'verification already stale' : 'invalidated: false',
        )
        expect(out).toContain('original evidence reason')
      }
      expect(out).toContain('verification-2')
      expect(out).toContain('/specd-verify')
      expect(out).not.toContain(HASH)
      expect(out).not.toContain('export const source')
    },
  )

  it('exits 1 through the shared error path and omits digest metadata', async () => {
    const { kernel, stdout, stderr } = setup()
    kernel.changes.completeVerification.execute.mockRejectedValue(new MismatchError())

    const program = makeProgram()
    registerChangeVerification(program.command('change'))
    await program
      .parseAsync([
        'node',
        'specd',
        'change',
        'verification',
        'complete',
        'my-change',
        '--format',
        'json',
      ])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('repeat verification work')
    expect(stdout()).toContain('VERIFICATION_FINGERPRINT_MISMATCH')
    expect(stdout()).not.toContain(HASH)
    expect(kernel.changes.completeVerification.execute).toHaveBeenCalledTimes(1)
  })

  it('delegates an unknown change to handleError', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.startVerification.execute.mockRejectedValue(new ChangeNotFoundError('missing'))

    const program = makeProgram()
    registerChangeVerification(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'verification', 'start', 'missing'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('error:')
    expect(kernel.changes.startVerification.execute).toHaveBeenCalledTimes(1)
  })
})
