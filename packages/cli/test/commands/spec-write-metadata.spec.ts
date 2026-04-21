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
vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  return {
    ...actual,
    readFile: vi.fn(),
  }
})

import { loadConfig } from '../../src/load-config.js'
import { createCliKernel } from '../../src/kernel.js'
import { registerSpecWriteMetadata } from '../../src/commands/spec/write-metadata.js'
import * as fsPromises from 'node:fs/promises'
import {
  ArtifactConflictError,
  MetadataValidationError,
  DependsOnOverwriteError,
} from '@specd/core'

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

const validJson = JSON.stringify({ title: 'Auth Login', description: 'A spec' })

describe('spec write-metadata', () => {
  it('writes metadata from --input file', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(fsPromises.readFile).mockResolvedValue(validJson)
    kernel.specs.saveMetadata.execute.mockResolvedValue({ spec: 'default:auth/login' })

    const program = makeProgram()
    registerSpecWriteMetadata(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'write-metadata',
      'auth/login',
      '--input',
      '/tmp/metadata.yaml',
    ])

    expect(fsPromises.readFile).toHaveBeenCalledWith('/tmp/metadata.yaml', 'utf-8')
    expect(kernel.specs.saveMetadata.execute).toHaveBeenCalledWith(
      expect.objectContaining({ content: validJson }),
    )
    expect(stdout()).toContain('wrote metadata for default:auth/login')
  })

  it('exits 1 on invalid JSON', async () => {
    const { stderr } = setup()
    vi.mocked(fsPromises.readFile).mockResolvedValue('{{{invalid')

    const program = makeProgram()
    registerSpecWriteMetadata(program.command('spec'))
    await program
      .parseAsync([
        'node',
        'specd',
        'spec',
        'write-metadata',
        'auth/login',
        '--input',
        '/tmp/bad.json',
      ])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('error: invalid JSON:')
  })

  it('exits 1 when spec not found', async () => {
    const { kernel, stderr } = setup()
    vi.mocked(fsPromises.readFile).mockResolvedValue(validJson)
    kernel.specs.saveMetadata.execute.mockResolvedValue(null)

    const program = makeProgram()
    registerSpecWriteMetadata(program.command('spec'))
    await program
      .parseAsync([
        'node',
        'specd',
        'spec',
        'write-metadata',
        'missing/spec',
        '--input',
        '/tmp/metadata.yaml',
      ])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('not found')
  })

  it('exits 1 when workspace is unknown', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerSpecWriteMetadata(program.command('spec'))
    await program
      .parseAsync([
        'node',
        'specd',
        'spec',
        'write-metadata',
        'unknown-ws:some/path',
        '--input',
        '/tmp/metadata.yaml',
      ])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('error:')
  })

  it('outputs JSON with result ok', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(fsPromises.readFile).mockResolvedValue(validJson)
    kernel.specs.saveMetadata.execute.mockResolvedValue({ spec: 'default:auth/login' })

    const program = makeProgram()
    registerSpecWriteMetadata(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'write-metadata',
      'auth/login',
      '--input',
      '/tmp/metadata.yaml',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(parsed.spec).toBe('default:auth/login')
  })

  it('passes --force through to use case', async () => {
    const { kernel } = setup()
    vi.mocked(fsPromises.readFile).mockResolvedValue(validJson)
    kernel.specs.saveMetadata.execute.mockResolvedValue({ spec: 'default:auth/login' })

    const program = makeProgram()
    registerSpecWriteMetadata(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'write-metadata',
      'auth/login',
      '--input',
      '/tmp/metadata.yaml',
      '--force',
    ])

    expect(kernel.specs.saveMetadata.execute).toHaveBeenCalledWith(
      expect.objectContaining({ force: true }),
    )
  })

  it('exits 1 on artifact conflict error', async () => {
    const { kernel, stderr } = setup()
    vi.mocked(fsPromises.readFile).mockResolvedValue(validJson)
    kernel.specs.saveMetadata.execute.mockRejectedValue(
      new ArtifactConflictError('.specd-metadata.yaml', validJson, 'old content'),
    )

    const program = makeProgram()
    registerSpecWriteMetadata(program.command('spec'))
    await program
      .parseAsync([
        'node',
        'specd',
        'spec',
        'write-metadata',
        'auth/login',
        '--input',
        '/tmp/metadata.yaml',
      ])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('error:')
  })

  it('exits 1 on MetadataValidationError', async () => {
    const { kernel, stdout, stderr } = setup()
    vi.mocked(fsPromises.readFile).mockResolvedValue(validJson)
    kernel.specs.saveMetadata.execute.mockRejectedValue(
      new MetadataValidationError('title: Required'),
    )

    const program = makeProgram()
    registerSpecWriteMetadata(program.command('spec'))
    await program
      .parseAsync([
        'node',
        'specd',
        'spec',
        'write-metadata',
        'auth/login',
        '--input',
        '/tmp/metadata.yaml',
      ])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('error:')
    expect(stderr()).toContain('Metadata validation failed')
    expect(stdout()).toBe('')
  })

  it('exits 1 on DependsOnOverwriteError', async () => {
    const { kernel, stdout, stderr } = setup()
    vi.mocked(fsPromises.readFile).mockResolvedValue(validJson)
    kernel.specs.saveMetadata.execute.mockRejectedValue(
      new DependsOnOverwriteError(['core:config', 'core:schema-format'], ['core:change']),
    )

    const program = makeProgram()
    registerSpecWriteMetadata(program.command('spec'))
    await program
      .parseAsync([
        'node',
        'specd',
        'spec',
        'write-metadata',
        'auth/login',
        '--input',
        '/tmp/metadata.yaml',
      ])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('error:')
    expect(stderr()).toContain('dependsOn would change')
    expect(stdout()).toBe('')
  })
})
