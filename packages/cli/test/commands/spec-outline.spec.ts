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
import { registerSpecOutline } from '../../src/commands/spec/outline.js'

const mockOutline = [
  { type: 'section', label: 'Purpose', depth: 0 },
  { type: 'section', label: 'Requirements', depth: 0 },
]

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

describe('spec outline', () => {
  it('outputs outlines for ALL spec-scoped artifacts by default', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getOutline.execute.mockResolvedValue([
      { filename: 'spec.md', outline: mockOutline },
      { filename: 'verify.md', outline: mockOutline },
    ])

    const program = makeProgram()
    registerSpecOutline(program.command('specs'))
    await program.parseAsync(['node', 'specd', 'specs', 'outline', 'default:auth/login'])

    const out = stdout()
    const parsed = JSON.parse(out)
    expect(parsed).toHaveLength(2)
    expect(parsed[0].filename).toBe('spec.md')
    expect(parsed[1].filename).toBe('verify.md')
    expect(parsed[0].outline).toEqual(mockOutline)
  })

  it('outputs structured data in json format', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getOutline.execute.mockResolvedValue([
      { filename: 'spec.md', outline: mockOutline },
    ])

    const program = makeProgram()
    registerSpecOutline(program.command('specs'))
    await program.parseAsync([
      'node',
      'specd',
      'specs',
      'outline',
      'default:auth/login',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed[0].filename).toBe('spec.md')
    expect(parsed[0].outline).toEqual(mockOutline)
  })

  it('passes artifactId to use case', async () => {
    const { kernel } = setup()
    kernel.specs.getOutline.execute.mockResolvedValue([
      { filename: 'verify.md', outline: mockOutline },
    ])
    kernel.specs.getActiveSchema.execute.mockResolvedValue({
      raw: false,
      schema: {
        artifact: vi.fn().mockReturnValue({
          id: 'verify',
          scope: 'spec',
          output: 'verify.md',
        }),
      },
    })

    const program = makeProgram()
    registerSpecOutline(program.command('specs'))
    await program.parseAsync([
      'node',
      'specd',
      'specs',
      'outline',
      'default:auth/login',
      '--artifact',
      'verify',
    ])

    expect(kernel.specs.getOutline.execute).toHaveBeenCalledWith(
      expect.objectContaining({ artifactId: 'verify' }),
    )
  })

  it('passes filename to use case', async () => {
    const { kernel } = setup()
    kernel.specs.getOutline.execute.mockResolvedValue([
      { filename: 'verify.md', outline: mockOutline },
    ])

    const program = makeProgram()
    registerSpecOutline(program.command('specs'))
    await program.parseAsync([
      'node',
      'specd',
      'specs',
      'outline',
      'default:auth/login',
      '--file',
      'verify.md',
    ])

    expect(kernel.specs.getOutline.execute).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'verify.md' }),
    )
  })

  it('passes full flag to use case', async () => {
    const { kernel } = setup()
    kernel.specs.getOutline.execute.mockResolvedValue([
      { filename: 'spec.md', outline: mockOutline },
    ])

    const program = makeProgram()
    registerSpecOutline(program.command('specs'))
    await program.parseAsync(['node', 'specd', 'specs', 'outline', 'default:auth/login', '--full'])

    expect(kernel.specs.getOutline.execute).toHaveBeenCalledWith(
      expect.objectContaining({ full: true }),
    )
  })

  it('passes hints flag to use case', async () => {
    const { kernel } = setup()
    kernel.specs.getOutline.execute.mockResolvedValue([
      { filename: 'spec.md', outline: mockOutline },
    ])

    const program = makeProgram()
    registerSpecOutline(program.command('specs'))
    await program.parseAsync(['node', 'specd', 'specs', 'outline', 'default:auth/login', '--hints'])

    expect(kernel.specs.getOutline.execute).toHaveBeenCalledWith(
      expect.objectContaining({ hints: true }),
    )
  })

  it('exits 1 for unknown artifact ID', async () => {
    const { kernel, stderr } = setup()
    kernel.specs.getActiveSchema.execute.mockResolvedValue({
      raw: false,
      schema: { artifact: vi.fn().mockReturnValue(null) },
    })

    const program = makeProgram()
    registerSpecOutline(program.command('specs'))
    await program
      .parseAsync([
        'node',
        'specd',
        'specs',
        'outline',
        'default:auth/login',
        '--artifact',
        'unknown',
      ])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain("unknown artifact ID 'unknown'")
  })

  it('exits 1 for artifact with non-spec scope', async () => {
    const { kernel, stderr } = setup()
    kernel.specs.getActiveSchema.execute.mockResolvedValue({
      raw: false,
      schema: {
        artifact: vi.fn().mockReturnValue({
          id: 'design',
          scope: 'change',
          output: 'design.md',
        }),
      },
    })

    const program = makeProgram()
    registerSpecOutline(program.command('specs'))
    await program
      .parseAsync([
        'node',
        'specd',
        'specs',
        'outline',
        'default:auth/login',
        '--artifact',
        'design',
      ])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain("artifact 'design' has scope 'change' (must be 'spec' to outline)")
  })

  it('handles domain errors via handleError', async () => {
    const { kernel, stderr } = setup()
    const { SpecNotFoundError } = await import('@specd/core')
    kernel.specs.getOutline.execute.mockRejectedValue(new SpecNotFoundError('auth/missing'))

    const program = makeProgram()
    registerSpecOutline(program.command('specs'))
    await program
      .parseAsync(['node', 'specd', 'specs', 'outline', 'default:auth/missing'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('error:')
  })

  it('deduplicates when --artifact and --file resolve to same file', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getOutline.execute.mockResolvedValue([
      { filename: 'spec.md', outline: mockOutline },
    ])
    kernel.specs.getActiveSchema.execute.mockResolvedValue({
      raw: false,
      schema: {
        artifact: vi.fn().mockReturnValue({
          id: 'specs',
          scope: 'spec',
          output: 'spec.md',
        }),
      },
    })

    const program = makeProgram()
    registerSpecOutline(program.command('specs'))
    await program.parseAsync([
      'node',
      'specd',
      'specs',
      'outline',
      'default:auth/login',
      '--artifact',
      'specs',
      '--file',
      'spec.md',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed).toHaveLength(1)
    expect(parsed[0].filename).toBe('spec.md')
  })
})
