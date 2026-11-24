import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
  makeMockHost,
} from '../helpers.js'

vi.mock('../../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
  buildCliKernelOptions: vi.fn(() => ({})),
}))

import { resolveCliContext } from '../../../src/helpers/cli-context.js'
import { CheckPredicateFailedError, InvalidateRequiresForceError, OverlapEntry } from '@specd/sdk'
import { registerChangeApprove } from '../../../src/commands/change/approve.js'
import { registerChangeInvalidate } from '../../../src/commands/change/invalidate.js'
import { registerChangeArchive } from '../../../src/commands/change/archive.js'
import { registerChangeVerification } from '../../../src/commands/change/verification.js'
import { registerChangeStatus } from '../../../src/commands/change/status.js'

const HASH = 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'

const fingerprint = {
  artifacts: { algorithm: 'artifact-pre-hash-v1', files: { 'spec:login': HASH } },
  implementation: {
    hashAlgorithm: 'sha256',
    textNormalization: 'text-v1',
    binaryNormalization: 'bytes-v1',
    files: { 'src/login.ts': { hash: HASH, content: 'export const source = true\n' } },
  },
}

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue(
    makeMockHost({ config, configFilePath: null, kernel }),
  )
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('cli audit round 2', () => {
  describe('approve --help', () => {
    it.each(['spec', 'signoff'])(
      'documents the metadata error additions for approve %s',
      (gate) => {
        const program = makeProgram()
        const parent = program.command('change')
        registerChangeApprove(parent)
        const approve = parent.commands.find((command) => command.name() === 'approve')!
        const sub = approve.commands.find((command) => command.name() === gate)!
        let help = ''
        sub.configureOutput({ writeOut: (text) => (help += text) })
        sub.outputHelp()

        expect(help).toContain('error payload additions after a failed approval')
        expect(help).toContain('`metadata`')
        expect(help).toContain('blockers: [{ code, message, label?, checkId?, action?, bypassFlag?')
        expect(help).toContain('nextAction?: { targetStep, actionType, command: string|null')
      },
    )
  })

  describe('invalidate', () => {
    async function runInvalidate(extra: string[] = []): Promise<void> {
      const program = makeProgram()
      registerChangeInvalidate(program.command('change'))
      await program
        .parseAsync(['node', 'specd', 'change', 'invalidate', 'feat', '--reason', 'r', ...extra])
        .catch(() => {})
    }

    it('projects a non-null nextAction.action and maps the command for a known kind', async () => {
      const { kernel, stdout } = setup()
      const action = { kind: 'approve-spec' }
      kernel.changes.invalidate.execute.mockResolvedValue({
        change: { name: 'feat', state: 'designing' },
        reason: 'r',
        effectivePolicy: { artifacts: 'none', workflow: 'preserve' },
        affected: [],
        blockers: [],
        nextAction: {
          targetStep: 'ready',
          actionType: 'cognitive',
          reason: 'Approve the spec',
          intent: null,
          action,
        },
      })
      await runInvalidate(['--format', 'json'])

      const parsed = JSON.parse(stdout()) as {
        nextAction: { action: unknown; command: string | null; intent: unknown }
      }
      expect(parsed.nextAction.action).toEqual(action)
      expect(parsed.nextAction.command).toBe('specd changes approve spec')
      expect(parsed.nextAction.intent).toBeNull()
    })

    it('keeps the action but maps no command for an unknown kind', async () => {
      const { kernel, stdout } = setup()
      const action = { kind: '@security.code-scan', guidance: 'Run the scan' }
      kernel.changes.invalidate.execute.mockResolvedValue({
        change: { name: 'feat', state: 'designing' },
        reason: 'r',
        effectivePolicy: { artifacts: 'none', workflow: 'preserve' },
        affected: [],
        blockers: [],
        nextAction: {
          targetStep: 'designing',
          actionType: 'cognitive',
          reason: 'Scan',
          intent: null,
          action,
        },
      })
      await runInvalidate(['--format', 'json'])

      const parsed = JSON.parse(stdout()) as {
        nextAction: { action: unknown; command: string | null; guidance?: string }
      }
      expect(parsed.nextAction.action).toEqual(action)
      expect(parsed.nextAction.command).toBeNull()
      expect(parsed.nextAction.guidance).toBe('Run the scan')
    })

    it('prints the --force hint exactly once in text mode', async () => {
      const { kernel, stderr } = setup()
      kernel.changes.invalidate.execute.mockRejectedValue(
        new InvalidateRequiresForceError([{ gate: 'spec', target: 'designing' }]),
      )
      await runInvalidate()

      expect(process.exit).toHaveBeenCalledWith(1)
      const forceHints = stderr().match(/Re-run with --force/g) ?? []
      expect(forceHints).toHaveLength(1)
      expect(stderr()).not.toContain('Re-run with --force.')
    })

    it('projects blocker label, checkId and bypassFlag in JSON and text', async () => {
      const blockers = [
        {
          code: 'OVERLAP_CONFLICT',
          message: 'Specs overlap',
          label: 'Spec overlap',
          checkId: 'spec.overlap',
          isSkippable: true,
        },
      ]
      const result = {
        change: { name: 'feat', state: 'designing' },
        reason: 'r',
        effectivePolicy: { artifacts: 'none', workflow: 'preserve' },
        affected: [],
        blockers,
        nextAction: { targetStep: 'designing', actionType: 'cognitive', reason: 'x', intent: null },
      }
      const json = setup()
      json.kernel.changes.invalidate.execute.mockResolvedValue(result)
      await runInvalidate(['--format', 'json'])
      const parsed = JSON.parse(json.stdout()) as { blockers: Record<string, unknown>[] }
      expect(parsed.blockers).toEqual([
        {
          code: 'OVERLAP_CONFLICT',
          message: 'Specs overlap',
          label: 'Spec overlap',
          checkId: 'spec.overlap',
          bypassFlag: '--skip-checks spec.overlap',
        },
      ])

      vi.restoreAllMocks()
      const text = setup()
      text.kernel.changes.invalidate.execute.mockResolvedValue(result)
      await runInvalidate()
      const out = text.stdout()
      const lines = out.split('\n')
      const at = lines.indexOf('  ! OVERLAP_CONFLICT — Spec overlap: Specs overlap')
      expect(at).toBeGreaterThanOrEqual(0)
      expect(lines[at + 1]).toBe('    bypass: --skip-checks spec.overlap')
      expect(out.match(/bypass:/g)).toHaveLength(1)
    })
  })

  describe('archive overlap hint', () => {
    it('ends with the exact skippable bypass sentence for a skippable overlap', async () => {
      const { kernel, stderr } = setup()
      kernel.changes.status.execute.mockResolvedValue({
        change: { workspaces: ['default'] },
        artifactStatuses: [],
        specDependsOn: {},
        implementationTracking: { trackedFiles: [], links: [] },
      })
      kernel.changes.archive.execute.mockRejectedValue(
        new CheckPredicateFailedError(
          'spec.overlap',
          'Checking spec overlap',
          'OVERLAP_CONFLICT',
          'Specs overlap with other active changes',
          undefined,
          { entries: [new OverlapEntry('core:config', [{ name: 'beta', state: 'designing' }])] },
          true,
          { from: 'archivable', to: 'archiving' },
        ),
      )
      const program = makeProgram()
      registerChangeArchive(program.command('change'))
      await program.parseAsync(['node', 'specd', 'change', 'archive', 'feat']).catch(() => {})

      expect(process.exit).toHaveBeenCalledWith(1)
      const err = stderr()
      expect(err.match(/core:config/g)).toHaveLength(1)
      const errLines = err.trimEnd().split('\n')
      expect(errLines.at(-1)).toContain(
        'Retry with --skip-checks spec.overlap if an exception is granted',
      )
      expect(err.match(/Retry with --skip-checks/g)).toHaveLength(1)
      expect(err).not.toContain('--allow-overlap')
    })
  })

  describe('verification invalidate blockers', () => {
    it('omits command when the action kind has no mapping or no changeName', async () => {
      const { kernel, stdout } = setup()
      kernel.changes.invalidateVerification.execute.mockResolvedValue({
        change: { name: 'feat', state: 'done' },
        verification: { id: 'verification-2', status: 'stale', fingerprint },
        invalidated: true,
        reason: 'inputs changed',
        signoffChanged: false,
        automaticReturn: null,
        blockers: [
          { code: 'UNMAPPED', message: 'plugin', action: { kind: '@plugin.check' } },
          { code: 'NO_NAME', message: 'refresh', action: { kind: 'refresh-status' } },
          {
            code: 'BLANK_NAME',
            message: 'start',
            action: { kind: 'start-verification', params: { changeName: '  ' } },
          },
        ],
        nextAction: { targetStep: 'done', actionType: 'cognitive', reason: 'x', intent: 'verify' },
      })
      const program = makeProgram()
      registerChangeVerification(program.command('change'))
      await program.parseAsync([
        'node',
        'specd',
        'change',
        'verification',
        'invalidate',
        'feat',
        '--reason',
        'inputs changed',
        '--format',
        'json',
      ])

      const parsed = JSON.parse(stdout()) as { blockers: Record<string, unknown>[] }
      expect(parsed.blockers).toHaveLength(3)
      for (const blocker of parsed.blockers) {
        expect(Object.keys(blocker).sort()).toEqual(['action', 'code', 'message'])
      }
    })

    it('projects label, checkId and bypassFlag without raw isSkippable', async () => {
      const { kernel, stdout } = setup()
      kernel.changes.invalidateVerification.execute.mockResolvedValue({
        change: { name: 'feat', state: 'done' },
        verification: { id: 'verification-2', status: 'stale', fingerprint },
        invalidated: true,
        reason: 'inputs changed',
        signoffChanged: false,
        automaticReturn: null,
        blockers: [
          {
            code: 'B',
            message: 'blocked',
            label: 'Blocked check',
            checkId: 'a.b',
            isSkippable: true,
            action: { kind: 'approve-spec' },
          },
        ],
        nextAction: { targetStep: 'done', actionType: 'cognitive', reason: 'x', intent: 'verify' },
      })
      const program = makeProgram()
      registerChangeVerification(program.command('change'))
      await program.parseAsync([
        'node',
        'specd',
        'change',
        'verification',
        'invalidate',
        'feat',
        '--reason',
        'inputs changed',
        '--format',
        'json',
      ])
      const parsed = JSON.parse(stdout()) as { blockers: Record<string, unknown>[] }
      expect(parsed.blockers).toEqual([
        {
          code: 'B',
          message: 'blocked',
          label: 'Blocked check',
          checkId: 'a.b',
          bypassFlag: '--skip-checks a.b',
          action: { kind: 'approve-spec' },
          command: 'specd changes approve spec',
        },
      ])
    })
  })

  describe('drafted status blockers', () => {
    it('passes blocker.action through unchanged in JSON', async () => {
      const { kernel, stdout } = setup()
      const action = {
        kind: '@security.code-scan',
        params: { scope: 'all' },
        guidance: 'Run the scan',
      }
      kernel.changes.status.execute.mockResolvedValue({
        schemaWarnings: [],
        specDependsOn: {},
        implementationTracking: { trackedFiles: [], links: [] },
        artifactStatuses: [],
        nextAction: {
          targetStep: 'designing',
          actionType: 'cognitive',
          reason: '...',
          command: '/specd-design',
        },
        draftView: {
          name: 'my-change',
          state: 'designing',
          specIds: [],
          schemaName: '@specd/schema-std',
          schemaVersion: 1,
        },
        lifecycle: {
          validTransitions: ['ready', 'designing'],
          availableTransitions: [],
          availableSteps: [],
          blockers: [],
          approvals: { spec: false, signoff: false },
          nextArtifact: null,
          changePath: '.specd/drafts/my-change',
          schemaInfo: { name: '@specd/schema-std', version: 1, artifacts: [] },
        },
        blockers: [
          {
            code: 'PLUGIN_BLOCK',
            message: 'Plugin blocks',
            checkId: '@security.code-scan',
            isSkippable: false,
            action,
          },
        ],
      })
      const program = makeProgram()
      registerChangeStatus(program.command('change'))
      await program.parseAsync([
        'node',
        'specd',
        'change',
        'status',
        'my-change',
        '--format',
        'json',
      ])

      const parsed = JSON.parse(stdout()) as { blockers: Record<string, unknown>[] }
      expect(parsed.blockers).toEqual([
        {
          code: 'PLUGIN_BLOCK',
          message: 'Plugin blocks',
          checkId: '@security.code-scan',
          action,
        },
      ])
    })
  })
})
