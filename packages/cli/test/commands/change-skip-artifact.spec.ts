/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ChangeNotFoundError, ArtifactNotFoundError, ArtifactNotOptionalError } from '@specd/core'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  captureStdout,
  captureStderr,
} from './helpers.js'

vi.mock('../../src/load-config.js', () => ({ loadConfig: vi.fn() }))
vi.mock('../../src/kernel.js', () => ({ createCliKernel: vi.fn() }))

import { loadConfig } from '../../src/load-config.js'
import { createCliKernel } from '../../src/kernel.js'
import { registerChangeSkipArtifact } from '../../src/commands/change/skip-artifact.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(loadConfig).mockResolvedValue(config)
  vi.mocked(createCliKernel).mockReturnValue(kernel)
  const stdout = captureStdout()
  const stderr = captureStderr()
  vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('change skip-artifact', () => {
  it('prints confirmation on success', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.skipArtifact.execute.mockResolvedValue(undefined)

    const program = makeProgram()
    registerChangeSkipArtifact(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'skip-artifact', 'my-change', 'proposal'])

    expect(stdout()).toContain('skipped artifact proposal on my-change')
  })

  it('outputs JSON on success', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.skipArtifact.execute.mockResolvedValue(undefined)

    const program = makeProgram()
    registerChangeSkipArtifact(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'skip-artifact',
      'my-change',
      'proposal',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(parsed.name).toBe('my-change')
    expect(parsed.artifactId).toBe('proposal')
  })

  it('passes reason to use case when provided', async () => {
    const { kernel } = setup()
    kernel.changes.skipArtifact.execute.mockResolvedValue(undefined)
    captureStdout()

    const program = makeProgram()
    registerChangeSkipArtifact(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'skip-artifact',
      'my-change',
      'proposal',
      '--reason',
      'not needed',
    ])

    const call = kernel.changes.skipArtifact.execute.mock.calls[0][0]
    expect(call.reason).toBe('not needed')
  })

  it('omits reason when not provided', async () => {
    const { kernel } = setup()
    kernel.changes.skipArtifact.execute.mockResolvedValue(undefined)
    captureStdout()

    const program = makeProgram()
    registerChangeSkipArtifact(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'skip-artifact', 'my-change', 'proposal'])

    const call = kernel.changes.skipArtifact.execute.mock.calls[0][0]
    expect('reason' in call).toBe(false)
  })

  it('exits 1 when non-optional artifact is rejected', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.skipArtifact.execute.mockRejectedValue(new ArtifactNotOptionalError('spec'))

    const program = makeProgram()
    registerChangeSkipArtifact(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'skip-artifact', 'my-change', 'spec'])

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('exits 1 when change not found', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.skipArtifact.execute.mockRejectedValue(new ChangeNotFoundError('missing'))

    const program = makeProgram()
    registerChangeSkipArtifact(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'skip-artifact', 'missing', 'proposal'])

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('exits 1 when artifact ID is unknown', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.skipArtifact.execute.mockRejectedValue(
      new ArtifactNotFoundError('unknown-artifact', 'my-change'),
    )

    const program = makeProgram()
    registerChangeSkipArtifact(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'skip-artifact',
      'my-change',
      'unknown-artifact',
    ])

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('exits with error when artifact-id argument is missing', async () => {
    setup()

    const program = makeProgram()
    registerChangeSkipArtifact(program.command('change'))
    await expect(
      program.parseAsync(['node', 'specd', 'change', 'skip-artifact', 'my-change']),
    ).rejects.toThrow()
  })
})
