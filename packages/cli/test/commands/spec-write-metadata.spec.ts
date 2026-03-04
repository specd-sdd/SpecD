/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  captureStdout,
  captureStderr,
} from './helpers.js'

vi.mock('../../src/load-config.js', () => ({ loadConfig: vi.fn() }))
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
import { ArtifactConflictError } from '@specd/core'

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

const validYaml = 'title: Auth Login\ndescription: A spec\n'

describe('spec write-metadata', () => {
  it('writes metadata from --input file', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(fsPromises.readFile).mockResolvedValue(validYaml)
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
      expect.objectContaining({ content: validYaml }),
    )
    expect(stdout()).toContain('wrote .specd-metadata.yaml for default:auth/login')
  })

  it('exits 1 on invalid YAML', async () => {
    const { stderr } = setup()
    vi.mocked(fsPromises.readFile).mockResolvedValue('{{{invalid')

    const program = makeProgram()
    registerSpecWriteMetadata(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'write-metadata',
      'auth/login',
      '--input',
      '/tmp/bad.yaml',
    ])

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('error: invalid YAML:')
  })

  it('exits 1 when spec not found', async () => {
    const { kernel, stderr } = setup()
    vi.mocked(fsPromises.readFile).mockResolvedValue(validYaml)
    kernel.specs.saveMetadata.execute.mockResolvedValue(null)

    const program = makeProgram()
    registerSpecWriteMetadata(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'write-metadata',
      'missing/spec',
      '--input',
      '/tmp/metadata.yaml',
    ])

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('not found')
  })

  it('exits 1 when workspace is unknown', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerSpecWriteMetadata(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'write-metadata',
      'unknown-ws:some/path',
      '--input',
      '/tmp/metadata.yaml',
    ])

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('error:')
  })

  it('outputs JSON with result ok', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(fsPromises.readFile).mockResolvedValue(validYaml)
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
    vi.mocked(fsPromises.readFile).mockResolvedValue(validYaml)
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
    vi.mocked(fsPromises.readFile).mockResolvedValue(validYaml)
    kernel.specs.saveMetadata.execute.mockRejectedValue(
      new ArtifactConflictError('.specd-metadata.yaml', validYaml, 'old content'),
    )

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

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('error:')
  })
})
