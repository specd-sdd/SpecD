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
import { registerChangeArtifacts } from '../../../src/commands/change/artifacts.js'
import { ChangeNotFoundError } from '@specd/sdk'

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
      specIds: ['default:auth/login'],
    },
    artifactStatuses: [],
    lifecycle: {
      changePath: '/project/.specd/changes/my-change',
      schemaInfo: null,
    },
    ...overrides,
  }
}

afterEach(() => vi.restoreAllMocks())

describe('change artifacts', () => {
  it('renders artifact state, file display state, existence, and path in text output', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue(
      makeStatusResult({
        artifactStatuses: [
          {
            type: 'proposal',
            state: 'complete',
            effectiveStatus: 'complete',
            displayStatus: 'complete',
            files: [
              {
                key: 'proposal',
                filename: 'proposal.md',
                state: 'complete',
                hasDrift: false,
                displayStatus: 'complete',
              },
            ],
          },
        ],
      }),
    )
    vi.mocked(kernel.changes.repo.artifactExists).mockResolvedValue(true)

    const program = makeProgram()
    registerChangeArtifacts(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'artifacts', 'my-change'])

    const out = stdout()
    expect(out).toContain('complete')
    expect(out).toContain('proposal')
    expect(out).toContain('yes')
    expect(out).toContain('/project/.specd/changes/my-change/proposal.md')
  })

  it('renders [drift] tag when file has drift', async () => {
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
              },
            ],
          },
        ],
      }),
    )
    vi.mocked(kernel.changes.repo.artifactExists).mockResolvedValue(true)

    const program = makeProgram()
    registerChangeArtifacts(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'artifacts', 'my-change'])

    const out = stdout()
    expect(out).toContain('complete-with-drift')
    expect(out).toContain('[drift]')
  })

  it('renders displayStatus and hasDrift in JSON output', async () => {
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

    const parsed = JSON.parse(stdout()) as {
      artifacts: Array<{
        displayStatus: string
        hasDrift: boolean
        filename: string
      }>
    }
    expect(parsed.artifacts[0]?.displayStatus).toBe('complete-with-drift')
    expect(parsed.artifacts[0]?.hasDrift).toBe(true)
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

  it('renders multi-file artifact with per-key rows', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue(
      makeStatusResult({
        artifactStatuses: [
          {
            type: 'specs',
            state: 'complete',
            effectiveStatus: 'complete',
            displayStatus: 'complete',
            files: [
              {
                key: 'default:auth/login',
                filename: 'spec.md',
                state: 'complete',
                hasDrift: false,
                displayStatus: 'complete',
              },
              {
                key: 'default:billing/invoices',
                filename: 'spec.md',
                state: 'complete',
                hasDrift: true,
                displayStatus: 'complete-with-drift',
              },
            ],
          },
        ],
      }),
    )
    vi.mocked(kernel.changes.repo.artifactExists).mockResolvedValue(true)

    const program = makeProgram()
    registerChangeArtifacts(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'artifacts', 'my-change'])

    const out = stdout()
    expect(out).toContain('specs [default:auth/login]')
    expect(out).toContain('specs [default:billing/invoices]')
    expect(out).toContain('/project/.specd/changes/my-change/spec.md')
    expect(out).toContain('[drift]')
  })
})
