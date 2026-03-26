/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from './helpers.js'

vi.mock('../../src/load-config.js', () => ({
  loadConfig: vi.fn(),
  resolveConfigPath: vi.fn().mockResolvedValue(null),
}))
vi.mock('../../src/kernel.js', () => ({ createCliKernel: vi.fn() }))
import { loadConfig } from '../../src/load-config.js'
import { createCliKernel } from '../../src/kernel.js'
import { registerSpecGenerateMetadata } from '../../src/commands/spec/generate-metadata.js'
import { DependsOnOverwriteError } from '@specd/core'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(loadConfig).mockResolvedValue(config)
  vi.mocked(createCliKernel).mockResolvedValue(kernel)
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

  it('exits with error when schema has no metadataExtraction', async () => {
    const { kernel, stderr } = setup()
    vi.mocked(kernel.specs.generateMetadata.execute).mockResolvedValue({
      metadata: {},
      hasExtraction: false,
    })

    const program = makeProgram()
    registerSpecGenerateMetadata(program.command('spec'))
    await program
      .parseAsync(['node', 'specd', 'spec', 'generate-metadata', 'auth/login'])
      .catch(() => {})

    expect(stderr()).toContain('no metadataExtraction declarations')
    expect(process.exit).toHaveBeenCalledWith(1)
  })

  it('outputs generated JSON to stdout in text mode', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(kernel.specs.generateMetadata.execute).mockResolvedValue({
      metadata: {
        title: 'Login',
        generatedBy: 'core',
        contentHashes: { 'spec.md': 'sha256:abc123' },
      },
      hasExtraction: true,
    })

    const program = makeProgram()
    registerSpecGenerateMetadata(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'generate-metadata', 'auth/login'])

    const out = stdout()
    expect(out).toContain('"title": "Login"')
    expect(out).toContain('"generatedBy": "core"')
  })

  it('outputs JSON in json mode', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(kernel.specs.generateMetadata.execute).mockResolvedValue({
      metadata: { title: 'Login', generatedBy: 'core' },
      hasExtraction: true,
    })

    const program = makeProgram()
    registerSpecGenerateMetadata(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'generate-metadata',
      'auth/login',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout()) as Record<string, unknown>
    expect(parsed.spec).toBe('default:auth/login')
    expect(parsed.metadata).toEqual({ title: 'Login', generatedBy: 'core' })
  })

  it('writes metadata when --write is passed', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(kernel.specs.generateMetadata.execute).mockResolvedValue({
      metadata: { title: 'Login', generatedBy: 'core' },
      hasExtraction: true,
    })
    vi.mocked(kernel.specs.saveMetadata.execute).mockResolvedValue({
      spec: 'default:auth/login',
    })

    const program = makeProgram()
    registerSpecGenerateMetadata(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'generate-metadata',
      'auth/login',
      '--write',
    ])

    expect(kernel.specs.saveMetadata.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace: 'default',
      }),
    )
    expect(stdout()).toContain('wrote metadata for')
  })

  it('passes force flag when --write --force is used', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.generateMetadata.execute).mockResolvedValue({
      metadata: { title: 'Login', generatedBy: 'core' },
      hasExtraction: true,
    })
    vi.mocked(kernel.specs.saveMetadata.execute).mockResolvedValue({
      spec: 'default:auth/login',
    })

    const program = makeProgram()
    registerSpecGenerateMetadata(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'generate-metadata',
      'auth/login',
      '--write',
      '--force',
    ])

    expect(kernel.specs.saveMetadata.execute).toHaveBeenCalledWith(
      expect.objectContaining({ force: true }),
    )
  })

  it('rejects --force without --write', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerSpecGenerateMetadata(program.command('spec'))
    await program
      .parseAsync(['node', 'specd', 'spec', 'generate-metadata', 'auth/login', '--force'])
      .catch(() => {})

    expect(stderr()).toContain('--force requires --write')
    expect(process.exit).toHaveBeenCalledWith(1)
  })

  it('outputs JSON with written flag in --write --format json', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(kernel.specs.generateMetadata.execute).mockResolvedValue({
      metadata: { title: 'Login', generatedBy: 'core' },
      hasExtraction: true,
    })
    vi.mocked(kernel.specs.saveMetadata.execute).mockResolvedValue({
      spec: 'default:auth/login',
    })

    const program = makeProgram()
    registerSpecGenerateMetadata(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'generate-metadata',
      'auth/login',
      '--write',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout()) as Record<string, unknown>
    expect(parsed.result).toBe('ok')
    expect(parsed.spec).toBe('default:auth/login')
    expect(parsed.written).toBe(true)
  })

  it('exits 1 on DependsOnOverwriteError in --write mode', async () => {
    const { kernel, stdout, stderr } = setup()
    vi.mocked(kernel.specs.generateMetadata.execute).mockResolvedValue({
      metadata: { title: 'Login', generatedBy: 'core' },
      hasExtraction: true,
    })
    vi.mocked(kernel.specs.saveMetadata.execute).mockRejectedValue(
      new DependsOnOverwriteError(['core:config'], ['core:change']),
    )

    const program = makeProgram()
    registerSpecGenerateMetadata(program.command('spec'))
    await program
      .parseAsync(['node', 'specd', 'spec', 'generate-metadata', 'auth/login', '--write'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('error:')
    expect(stderr()).toContain('dependsOn would change')
    expect(stdout()).toBe('')
  })

  // --- Batch mode tests ---

  it('rejects --all without --write', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerSpecGenerateMetadata(program.command('spec'))
    await program
      .parseAsync(['node', 'specd', 'spec', 'generate-metadata', '--all'])
      .catch(() => {})

    expect(stderr()).toContain('--all requires --write')
    expect(process.exit).toHaveBeenCalledWith(1)
  })

  it('rejects --all with specPath', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerSpecGenerateMetadata(program.command('spec'))
    await program
      .parseAsync(['node', 'specd', 'spec', 'generate-metadata', 'auth/login', '--all', '--write'])
      .catch(() => {})

    expect(stderr()).toContain('--all and <specPath> are mutually exclusive')
    expect(process.exit).toHaveBeenCalledWith(1)
  })

  it('rejects --status without --all', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerSpecGenerateMetadata(program.command('spec'))
    await program
      .parseAsync([
        'node',
        'specd',
        'spec',
        'generate-metadata',
        'auth/login',
        '--write',
        '--status',
        'stale',
      ])
      .catch(() => {})

    expect(stderr()).toContain('--status requires --all')
    expect(process.exit).toHaveBeenCalledWith(1)
  })

  it('rejects invalid --status value', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerSpecGenerateMetadata(program.command('spec'))
    await program
      .parseAsync([
        'node',
        'specd',
        'spec',
        'generate-metadata',
        '--all',
        '--write',
        '--status',
        'bogus',
      ])
      .catch(() => {})

    expect(stderr()).toContain("invalid --status value 'bogus'")
    expect(process.exit).toHaveBeenCalledWith(1)
  })

  it('--all --write processes stale and missing specs by default', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(kernel.specs.list.execute).mockResolvedValue([
      { workspace: 'default', path: '_global/arch', title: 'arch', metadataStatus: 'stale' },
      { workspace: 'default', path: '_global/docs', title: 'docs', metadataStatus: 'missing' },
      { workspace: 'default', path: '_global/test', title: 'test', metadataStatus: 'fresh' },
    ])
    vi.mocked(kernel.specs.generateMetadata.execute).mockResolvedValue({
      metadata: { title: 'T', generatedBy: 'core' },
      hasExtraction: true,
    })
    vi.mocked(kernel.specs.saveMetadata.execute).mockResolvedValue({ spec: 'x' })

    const program = makeProgram()
    registerSpecGenerateMetadata(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'generate-metadata', '--all', '--write'])

    // 2 specs processed (stale + missing), not 3
    expect(kernel.specs.generateMetadata.execute).toHaveBeenCalledTimes(2)
    const out = stdout()
    expect(out).toContain('wrote metadata for default:_global/arch')
    expect(out).toContain('wrote metadata for default:_global/docs')
    expect(out).not.toContain('_global/test')
    expect(out).toContain('generated metadata for 2/2 specs')
  })

  it('--all --write --status all processes every spec', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(kernel.specs.list.execute).mockResolvedValue([
      { workspace: 'default', path: '_global/arch', title: 'arch', metadataStatus: 'stale' },
      { workspace: 'default', path: '_global/test', title: 'test', metadataStatus: 'fresh' },
    ])
    vi.mocked(kernel.specs.generateMetadata.execute).mockResolvedValue({
      metadata: { title: 'T', generatedBy: 'core' },
      hasExtraction: true,
    })
    vi.mocked(kernel.specs.saveMetadata.execute).mockResolvedValue({ spec: 'x' })

    const program = makeProgram()
    registerSpecGenerateMetadata(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'generate-metadata',
      '--all',
      '--write',
      '--status',
      'all',
    ])

    expect(kernel.specs.generateMetadata.execute).toHaveBeenCalledTimes(2)
    expect(stdout()).toContain('generated metadata for 2/2 specs')
  })

  it('--all continues on individual failure and exits 1', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(kernel.specs.list.execute).mockResolvedValue([
      { workspace: 'default', path: '_global/arch', title: 'arch', metadataStatus: 'stale' },
      { workspace: 'default', path: '_global/docs', title: 'docs', metadataStatus: 'stale' },
    ])
    vi.mocked(kernel.specs.generateMetadata.execute).mockResolvedValue({
      metadata: { title: 'T', generatedBy: 'core' },
      hasExtraction: true,
    })
    vi.mocked(kernel.specs.saveMetadata.execute)
      .mockRejectedValueOnce(new DependsOnOverwriteError(['a'], ['b']))
      .mockResolvedValueOnce({ spec: 'x' })

    const program = makeProgram()
    registerSpecGenerateMetadata(program.command('spec'))
    await program
      .parseAsync(['node', 'specd', 'spec', 'generate-metadata', '--all', '--write'])
      .catch(() => {})

    const out = stdout()
    expect(out).toContain('error: default:_global/arch:')
    expect(out).toContain('wrote metadata for default:_global/docs')
    expect(out).toContain('generated metadata for 1/2 specs')
    expect(process.exitCode).toBe(1)
  })

  it('--all JSON output has batch result structure', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(kernel.specs.list.execute).mockResolvedValue([
      { workspace: 'default', path: '_global/arch', title: 'arch', metadataStatus: 'stale' },
    ])
    vi.mocked(kernel.specs.generateMetadata.execute).mockResolvedValue({
      metadata: { title: 'T', generatedBy: 'core' },
      hasExtraction: true,
    })
    vi.mocked(kernel.specs.saveMetadata.execute).mockResolvedValue({ spec: 'x' })

    const program = makeProgram()
    registerSpecGenerateMetadata(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'generate-metadata',
      '--all',
      '--write',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout()) as Record<string, unknown>
    expect(parsed.result).toBe('ok')
    expect(parsed.total).toBe(1)
    expect(parsed.succeeded).toBe(1)
    expect(parsed.failed).toBe(0)
    expect(parsed.specs).toEqual([{ spec: 'default:_global/arch', status: 'ok' }])
  })

  it('--all reports no matches when filter excludes everything', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(kernel.specs.list.execute).mockResolvedValue([
      { workspace: 'default', path: '_global/arch', title: 'arch', metadataStatus: 'fresh' },
    ])

    const program = makeProgram()
    registerSpecGenerateMetadata(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'generate-metadata', '--all', '--write'])

    expect(stdout()).toContain('no specs match the status filter')
    expect(kernel.specs.generateMetadata.execute).not.toHaveBeenCalled()
  })
})
