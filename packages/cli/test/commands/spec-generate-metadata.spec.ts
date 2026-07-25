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
  buildCliKernelOptions: vi.fn(() => ({})),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerSpecGenerateMetadata } from '../../src/commands/spec/generate-metadata.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({
    config: config,
    configFilePath: null,
    kernel: kernel,
  })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('spec generate-metadata', () => {
  it('exits with error when neither specPath nor --all is provided', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerSpecGenerateMetadata(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'generate-metadata']).catch(() => {})

    expect(stderr()).toContain('either <specPath> or --all is required')
    expect(process.exit).toHaveBeenCalledWith(1)
  })

  it('delegates single-spec regeneration to kernel.specs.regenerateMetadata', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(kernel.specs.regenerateMetadata.execute).mockResolvedValue({
      kind: 'spec',
      result: {
        specId: 'default:auth/login',
        ok: true,
        result: {
          metadata: { title: 'Login' },
          metadataFingerprint: 'fp',
          source: 'generated',
          regenerated: true,
          warnings: [],
        },
      },
    })

    const program = makeProgram()
    registerSpecGenerateMetadata(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'generate-metadata', 'auth/login'])

    expect(kernel.specs.regenerateMetadata.execute).toHaveBeenCalledWith({
      target: { kind: 'spec', specId: 'default:auth/login' },
      force: false,
    })
    expect(stdout()).toContain('regenerated metadata for default:auth/login')
  })

  it('delegates batch regeneration when --all is passed', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.regenerateMetadata.execute).mockResolvedValue({
      kind: 'batch',
      failed: false,
      specs: [{ specId: 'default:auth/login', ok: true }],
    })

    const program = makeProgram()
    registerSpecGenerateMetadata(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'generate-metadata', '--all'])

    expect(kernel.specs.regenerateMetadata.execute).toHaveBeenCalledWith({
      target: { kind: 'batch' },
      force: false,
    })
  })

  it('passes force: true when --force is set', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(kernel.specs.regenerateMetadata.execute).mockResolvedValue({
      kind: 'spec',
      result: {
        specId: 'default:auth/login',
        ok: true,
        result: {
          metadata: { title: 'Login' },
          metadataFingerprint: 'fp',
          source: 'generated',
          regenerated: true,
          warnings: [],
        },
      },
    })

    const program = makeProgram()
    registerSpecGenerateMetadata(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'generate-metadata',
      'auth/login',
      '--force',
    ])

    expect(kernel.specs.regenerateMetadata.execute).toHaveBeenCalledWith({
      target: { kind: 'spec', specId: 'default:auth/login' },
      force: true,
    })
    expect(stdout()).toContain('regenerated metadata for default:auth/login')
  })

  it('emits batch JSON totals when --all --format json', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(kernel.specs.regenerateMetadata.execute).mockResolvedValue({
      kind: 'batch',
      failed: true,
      specs: [
        { specId: 'default:auth/login', ok: true },
        { specId: 'default:auth/logout', ok: false, error: 'boom' },
      ],
    })

    const program = makeProgram()
    registerSpecGenerateMetadata(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'generate-metadata',
      '--all',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('partial')
    expect(parsed.total).toBe(2)
    expect(parsed.succeeded).toBe(1)
    expect(parsed.failed).toBe(1)
    expect(parsed.specs).toEqual([
      { spec: 'default:auth/login', status: 'ok' },
      { spec: 'default:auth/logout', status: 'error', error: 'boom' },
    ])
  })

  it('emits batch JSON result ok when every spec succeeds', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(kernel.specs.regenerateMetadata.execute).mockResolvedValue({
      kind: 'batch',
      failed: false,
      specs: [
        { specId: 'default:auth/login', ok: true },
        { specId: 'default:auth/logout', ok: true },
      ],
    })

    const program = makeProgram()
    registerSpecGenerateMetadata(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'generate-metadata',
      '--all',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(parsed.total).toBe(2)
    expect(parsed.succeeded).toBe(2)
    expect(parsed.failed).toBe(0)
  })
})
