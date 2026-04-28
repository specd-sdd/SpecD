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
import { registerSpecShow } from '../../src/commands/spec/show.js'

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

const mockSpecResult = {
  artifacts: new Map([
    ['spec.md', { content: '# Auth Spec\n\nContent here.' }],
    ['verify.md', { content: '## Scenarios' }],
  ]),
}

describe('spec show', () => {
  it('prints artifact contents with headers when no --file given', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.get.execute.mockResolvedValue(mockSpecResult)

    const program = makeProgram()
    registerSpecShow(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'show', 'auth/login'])

    const out = stdout()
    expect(out).toContain('--- spec.md ---')
    expect(out).toContain('# Auth Spec')
    expect(out).toContain('--- verify.md ---')
    expect(out).toContain('## Scenarios')
  })

  it('prints all artifact contents in text mode', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.get.execute.mockResolvedValue(mockSpecResult)

    const program = makeProgram()
    registerSpecShow(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'show', 'auth/login'])

    const out = stdout()
    expect(out).toContain('# Auth Spec')
    expect(out).toContain('## Scenarios')
  })

  it('exits 1 when spec not found', async () => {
    const { kernel, stderr } = setup()
    kernel.specs.get.execute.mockResolvedValue(null)

    const program = makeProgram()
    registerSpecShow(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'show', 'missing/spec']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('not found')
  })

  it('outputs JSON as array of {filename, content}', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.get.execute.mockResolvedValue(mockSpecResult)

    const program = makeProgram()
    registerSpecShow(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'show', 'auth/login', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed[0].filename).toBe('spec.md')
    expect(parsed[0].content).toContain('# Auth Spec')
  })

  it('excludes .specd-metadata.yaml from text output', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.get.execute.mockResolvedValue({
      artifacts: new Map([
        ['spec.md', { content: '# Auth Spec' }],
        ['.specd-metadata.yaml', { content: 'id: auth/login\ntitle: Auth' }],
        ['verify.md', { content: '## Scenarios' }],
      ]),
    })

    const program = makeProgram()
    registerSpecShow(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'show', 'auth/login'])

    const out = stdout()
    expect(out).toContain('--- spec.md ---')
    expect(out).toContain('--- verify.md ---')
    expect(out).not.toContain('.specd-metadata.yaml')
    expect(out).not.toContain('id: auth/login')
  })

  it('exits 1 when workspace is unknown', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerSpecShow(program.command('spec'))
    await program
      .parseAsync(['node', 'specd', 'spec', 'show', 'unknown-ws:some/path'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('error:')
  })

  it('rejects when path argument is missing', async () => {
    setup()

    const program = makeProgram()
    registerSpecShow(program.command('spec'))
    await expect(program.parseAsync(['node', 'specd', 'spec', 'show'])).rejects.toThrow()
  })

  it('excludes .specd-metadata.yaml from JSON output', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.get.execute.mockResolvedValue({
      artifacts: new Map([
        ['spec.md', { content: '# Auth Spec' }],
        ['.specd-metadata.yaml', { content: 'id: auth/login\ntitle: Auth' }],
      ]),
    })

    const program = makeProgram()
    registerSpecShow(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'show', 'auth/login', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed.find((a: { filename: string }) => a.filename === 'spec.md')).toBeDefined()
    expect(
      parsed.find((a: { filename: string }) => a.filename === '.specd-metadata.yaml'),
    ).toBeUndefined()
  })

  describe('--artifact flag', () => {
    const mockSchema = {
      artifact: vi.fn(),
    }

    it('filters output by artifact ID', async () => {
      const { kernel, stdout } = setup()
      kernel.specs.get.execute.mockResolvedValue(mockSpecResult)
      kernel.specs.getActiveSchema.execute.mockResolvedValue({ raw: false, schema: mockSchema })
      mockSchema.artifact.mockReturnValue({
        id: 'specs',
        scope: 'spec',
        output: 'specs/**/spec.md',
      })

      const program = makeProgram()
      registerSpecShow(program.command('spec'))
      await program.parseAsync([
        'node',
        'specd',
        'spec',
        'show',
        'auth/login',
        '--artifact',
        'specs',
      ])

      const out = stdout()
      expect(out).toContain('--- spec.md ---')
      expect(out).toContain('# Auth Spec')
      expect(out).not.toContain('--- verify.md ---')
      expect(out).not.toContain('## Scenarios')
    })

    it('exits 1 for unknown artifact ID', async () => {
      const { kernel, stderr } = setup()
      kernel.specs.get.execute.mockResolvedValue(mockSpecResult)
      kernel.specs.getActiveSchema.execute.mockResolvedValue({ raw: false, schema: mockSchema })
      mockSchema.artifact.mockReturnValue(null)

      const program = makeProgram()
      registerSpecShow(program.command('spec'))
      await program
        .parseAsync(['node', 'specd', 'spec', 'show', 'auth/login', '--artifact', 'unknown'])
        .catch(() => {})

      expect(process.exit).toHaveBeenCalledWith(1)
      expect(stderr()).toContain("unknown artifact ID 'unknown'")
    })

    it('exits 1 for artifact with non-spec scope', async () => {
      const { kernel, stderr } = setup()
      kernel.specs.get.execute.mockResolvedValue(mockSpecResult)
      kernel.specs.getActiveSchema.execute.mockResolvedValue({ raw: false, schema: mockSchema })
      mockSchema.artifact.mockReturnValue({
        id: 'proposal',
        scope: 'change',
        output: 'proposal.md',
      })

      const program = makeProgram()
      registerSpecShow(program.command('spec'))
      await program
        .parseAsync(['node', 'specd', 'spec', 'show', 'auth/login', '--artifact', 'proposal'])
        .catch(() => {})

      expect(process.exit).toHaveBeenCalledWith(1)
      expect(stderr()).toContain("artifact 'proposal' has scope 'change' (must be 'spec' to show)")
    })

    it('exits 1 if requested artifact is missing on disk', async () => {
      const { kernel, stderr } = setup()
      kernel.specs.get.execute.mockResolvedValue({
        artifacts: new Map([['spec.md', { content: '# Auth Spec' }]]),
      })
      kernel.specs.getActiveSchema.execute.mockResolvedValue({ raw: false, schema: mockSchema })
      mockSchema.artifact.mockReturnValue({
        id: 'verify',
        scope: 'spec',
        output: 'specs/**/verify.md',
      })

      const program = makeProgram()
      registerSpecShow(program.command('spec'))
      await program
        .parseAsync(['node', 'specd', 'spec', 'show', 'auth/login', '--artifact', 'verify'])
        .catch(() => {})

      expect(process.exit).toHaveBeenCalledWith(1)
      expect(stderr()).toContain("artifact 'verify' (verify.md) not found on disk")
    })
  })
})
