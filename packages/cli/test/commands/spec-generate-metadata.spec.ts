import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
  makeMockHost,
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
  vi.mocked(resolveCliContext).mockResolvedValue(
    makeMockHost({
      config: config,
      configFilePath: null,
      kernel: kernel,
    }),
  )
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
      target: { kind: 'spec', specId: 'auth/login' },
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
      target: { kind: 'spec', specId: 'auth/login' },
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

  it('exits 1 with --force hint on stderr when single-spec fails with DEPENDS_ON_OVERWRITE', async () => {
    const { kernel, stdout, stderr } = setup()
    vi.mocked(kernel.specs.regenerateMetadata.execute).mockResolvedValue({
      kind: 'spec',
      result: {
        specId: 'default:auth/login',
        ok: false,
        code: 'DEPENDS_ON_OVERWRITE',
        error:
          'dependsOn would change (added: core:auth). Pass force to overwrite curated dependencies.',
      },
    })

    const program = makeProgram()
    registerSpecGenerateMetadata(program.command('spec'))
    await program
      .parseAsync(['node', 'specd', 'spec', 'generate-metadata', 'auth/login'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stdout()).toBe('')
    expect(stderr()).toContain('dependsOn would change')
    expect(stderr()).toContain('--force')
  })

  it('includes --force hint in JSON output when single-spec fails with DEPENDS_ON_OVERWRITE', async () => {
    const { kernel, stdout, stderr } = setup()
    vi.mocked(kernel.specs.regenerateMetadata.execute).mockResolvedValue({
      kind: 'spec',
      result: {
        specId: 'default:auth/login',
        ok: false,
        code: 'DEPENDS_ON_OVERWRITE',
        error:
          'dependsOn would change (added: core:auth). Pass force to overwrite curated dependencies.',
      },
    })

    const program = makeProgram()
    registerSpecGenerateMetadata(program.command('spec'))
    await program
      .parseAsync(['node', 'specd', 'spec', 'generate-metadata', 'auth/login', '--format', 'json'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('dependsOn would change')
    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('error')
    expect(parsed.code).toBe('DEPENDS_ON_OVERWRITE')
    expect(parsed.hint).toContain('--force')
  })
})
