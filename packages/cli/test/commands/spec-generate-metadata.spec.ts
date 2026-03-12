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

vi.mock('../../src/load-config.js', () => ({ loadConfig: vi.fn() }))
vi.mock('../../src/kernel.js', () => ({ createCliKernel: vi.fn() }))
import { loadConfig } from '../../src/load-config.js'
import { createCliKernel } from '../../src/kernel.js'
import { registerSpecGenerateMetadata } from '../../src/commands/spec/generate-metadata.js'
import { DependsOnOverwriteError } from '@specd/core'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(loadConfig).mockResolvedValue(config)
  vi.mocked(createCliKernel).mockReturnValue(kernel)
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('spec generate-metadata', () => {
  it('exits with error when path argument is missing', async () => {
    setup()

    const program = makeProgram()
    registerSpecGenerateMetadata(program.command('spec'))
    await expect(
      program.parseAsync(['node', 'specd', 'spec', 'generate-metadata']),
    ).rejects.toThrow()
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

  it('outputs generated YAML to stdout in text mode', async () => {
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
    expect(out).toContain('title: Login')
    expect(out).toContain('generatedBy: core')
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
    expect(stdout()).toContain('wrote .specd-metadata.yaml')
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
})
