import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
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
import { registerChangeArtifactInstruction } from '../../src/commands/change/artifact-instruction.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({ config, configFilePath: null, kernel })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('change artifact-instruction', () => {
  it('outputs availableOutlines in JSON payload', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.getArtifactInstruction.execute.mockResolvedValue({
      artifactId: 'specs',
      rulesPre: ['Read design first'],
      instruction: 'Write the artifact',
      template: null,
      delta: {
        formatInstructions: 'Use delta operations',
        domainInstructions: null,
        availableOutlines: ['core:core/config', 'cli:cli/spec-outline'],
      },
      rulesPost: ['Validate output'],
    })

    const program = makeProgram()
    registerChangeArtifactInstruction(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'artifact-instruction',
      'my-change',
      'specs',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(parsed.artifactId).toBe('specs')
    expect(parsed.delta.availableOutlines).toEqual(['core:core/config', 'cli:cli/spec-outline'])
    expect(parsed.delta).not.toHaveProperty('outlines')
  })

  it('prints availableOutlines in text output', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.getArtifactInstruction.execute.mockResolvedValue({
      artifactId: 'specs',
      rulesPre: [],
      instruction: null,
      template: null,
      delta: {
        formatInstructions: 'Use delta operations',
        domainInstructions: 'Prefer specific selectors',
        availableOutlines: ['core:core/config'],
      },
      rulesPost: [],
    })

    const program = makeProgram()
    registerChangeArtifactInstruction(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'artifact-instruction', 'my-change'])

    const out = stdout()
    expect(out).toContain('[delta]')
    expect(out).toContain('availableOutlines: ["core:core/config"]')
    expect(out).not.toContain('outlines')
  })

  it('handles domain errors via handleError', async () => {
    const { kernel, stderr } = setup()
    const { ChangeNotFoundError } = await import('@specd/core')
    kernel.changes.getArtifactInstruction.execute.mockRejectedValue(
      new ChangeNotFoundError('missing'),
    )

    const program = makeProgram()
    registerChangeArtifactInstruction(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'artifact-instruction', 'missing'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('error:')
  })
})
