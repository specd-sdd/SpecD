import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureStderr,
  captureStdout,
  ExitSentinel,
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
} from './helpers.js'

vi.mock('../../src/commands/graph/resolve-graph-cli-context.js', () => ({
  resolveGraphCliContext: vi.fn(),
}))

vi.mock('@specd/sdk', async () => {
  const actual = await vi.importActual<typeof import('@specd/sdk')>('@specd/sdk')
  return { ...actual, withOpenGraphProvider: vi.fn() }
})

import { withOpenGraphProvider, SpecdError } from '@specd/sdk'
import { resolveGraphCliContext } from '../../src/commands/graph/resolve-graph-cli-context.js'
import { registerGraphWhy } from '../../src/commands/graph/why.js'

class CodedError extends SpecdError {
  /**
   * Returns the error code.
   * @returns The code.
   */
  get code(): string {
    return this.codeValue
  }

  /**
   * Creates the error.
   * @param codeValue - Code to expose.
   * @param message - Message.
   */
  constructor(
    private readonly codeValue: string,
    message: string,
  ) {
    super(message)
  }
}

/**
 * Runs `graph why` with a provider whose open step fails.
 * @param error - The failure.
 * @param format - Output format.
 * @returns Captured stdout and stderr plus the exit code (null when the command returned).
 */
async function runFailing(
  error: Error,
  format: string,
): Promise<{ out: string; err: string; exit: number | null }> {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  kernel.project.getConfig.execute.mockReturnValue(config)
  vi.mocked(resolveGraphCliContext).mockResolvedValue({
    mode: 'configured',
    config,
    configFilePath: '/project/specd.yaml',
    kernel,
    projectRoot: '/project',
    vcsRoot: '/project',
  })
  vi.mocked(withOpenGraphProvider).mockRejectedValue(error)
  const getOut = captureStdout()
  const getErr = captureStderr()
  mockProcessExit()
  const program = makeProgram()
  registerGraphWhy(program.command('graph'))
  let exit: number | null = null
  try {
    await program.parseAsync(['node', 'specd', 'graph', 'why', 'nope:src/a.ts', '--format', format])
  } catch (caught) {
    if (!(caught instanceof ExitSentinel)) throw caught
    exit = caught.code
  }
  return { out: getOut(), err: getErr(), exit }
}

afterEach(() => vi.restoreAllMocks())

describe('graph why failure rendering', () => {
  it('exits non-zero and reports the UNKNOWN_WORKSPACE code in json', async () => {
    const result = await runFailing(
      new CodedError('UNKNOWN_WORKSPACE', "Unknown workspace 'nope' in path 'nope:src/a.ts'"),
      'json',
    )
    expect(result.exit).not.toBe(0)
    expect(result.exit).not.toBeNull()
    expect(`${result.out}${result.err}`).toContain('UNKNOWN_WORKSPACE')
  })

  it('exits non-zero and reports GRAPH_WHY_REQUIRES_CONFIG in json', async () => {
    const result = await runFailing(
      new CodedError(
        'GRAPH_WHY_REQUIRES_CONFIG',
        'path explanation requires a specd.yaml configuration',
      ),
      'json',
    )
    expect(result.exit).not.toBeNull()
    expect(`${result.out}${result.err}`).toContain('GRAPH_WHY_REQUIRES_CONFIG')
  })

  it('prints the message in text mode with a non-zero exit', async () => {
    const result = await runFailing(
      new CodedError('UNKNOWN_WORKSPACE', "Unknown workspace 'nope' in path 'nope:src/a.ts'"),
      'text',
    )
    expect(result.exit).not.toBeNull()
    expect(`${result.out}${result.err}`).toContain("Unknown workspace 'nope'")
  })
})
