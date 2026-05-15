import { describe, it, expect, vi, afterEach } from 'vitest'
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
import { registerChangeStatus } from '../../../src/commands/change/status.js'
import { ChangeNotFoundError } from '@specd/core'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({ config, configFilePath: null, kernel })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

function makeStatusResult(overrides: Record<string, unknown> = {}) {
  return {
    change: {
      name: 'my-change',
      state: 'designing',
      specIds: ['default:auth/login'],
      description: undefined,
      schemaName: '@specd/schema-std',
      schemaVersion: 1,
    },
    artifactStatuses: [],
    lifecycle: {
      validTransitions: ['implementing'],
      availableTransitions: ['implementing'],
      blockers: [],
      approvals: { spec: false, signoff: false },
      nextArtifact: null,
      changePath: '/project/.specd/changes/my-change',
      schemaInfo: null,
    },
    review: {
      required: false,
      route: null,
      reason: null,
      affectedArtifacts: [],
      overlapDetail: [],
    },
    blockers: [],
    nextAction: {
      targetStep: 'implementing',
      actionType: 'cognitive',
      reason: 'Proceed to next lifecycle step',
      command: '/specd-implement',
    },
    ...overrides,
  }
}

afterEach(() => vi.restoreAllMocks())

describe('change status', () => {
  it('renders displayStatus in text output for artifact details', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue(
      makeStatusResult({
        artifactStatuses: [
          {
            type: 'proposal',
            state: 'complete',
            effectiveStatus: 'complete',
            displayStatus: 'complete-with-drift',
            files: [
              {
                key: 'proposal',
                filename: 'proposal.md',
                state: 'complete',
                hasDrift: true,
                displayStatus: 'complete-with-drift',
              },
            ],
          },
        ],
      }),
    )

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

    const out = stdout()
    expect(out).toContain('proposal  complete-with-drift  (effective: complete)')
    expect(out).toContain('proposal  complete-with-drift  proposal.md')
    expect(out).toContain('[drift]')
  })

  it('renders [drift] tag for drifted files', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue(
      makeStatusResult({
        artifactStatuses: [
          {
            type: 'specs',
            state: 'complete',
            effectiveStatus: 'complete',
            displayStatus: 'complete-with-drift',
            files: [
              {
                key: 'default:auth/login',
                filename: 'spec.md',
                state: 'complete',
                hasDrift: true,
                displayStatus: 'complete-with-drift',
                validatedHash: 'abc123',
              },
              {
                key: 'default:billing/invoices',
                filename: 'spec.md',
                state: 'complete',
                hasDrift: false,
                displayStatus: 'complete',
                validatedHash: 'def456',
              },
            ],
          },
        ],
      }),
    )

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

    const out = stdout()
    expect(out).toContain('default:auth/login  complete-with-drift  spec.md  abc123  [drift]')
    expect(out).toContain('default:billing/invoices  complete  spec.md  def456')
  })

  it('renders displayStatus in JSON output with hasDrift', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue(
      makeStatusResult({
        artifactStatuses: [
          {
            type: 'proposal',
            state: 'complete',
            effectiveStatus: 'complete',
            displayStatus: 'complete-with-drift',
            files: [
              {
                key: 'proposal',
                filename: 'proposal.md',
                state: 'complete',
                hasDrift: true,
                displayStatus: 'complete-with-drift',
              },
            ],
          },
        ],
      }),
    )

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change', '--format', 'json'])

    const parsed = JSON.parse(stdout()) as {
      artifacts: Array<{
        type: string
        displayStatus: string
        files: Array<{ displayStatus: string; hasDrift: boolean }>
      }>
    }
    expect(parsed.artifacts[0]?.displayStatus).toBe('complete-with-drift')
    expect(parsed.artifacts[0]?.files[0]?.displayStatus).toBe('complete-with-drift')
    expect(parsed.artifacts[0]?.files[0]?.hasDrift).toBe(true)
  })

  it('exits 1 when change not found', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockRejectedValue(new ChangeNotFoundError('missing'))

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'missing']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('renders basic change info in text output', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue(makeStatusResult())

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

    const out = stdout()
    expect(out).toContain('change:      my-change')
    expect(out).toContain('state:       designing')
    expect(out).toContain('specs:       default:auth/login')
  })
})
