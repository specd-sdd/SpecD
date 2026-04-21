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
import { ChangeNotFoundError, SpecNotInChangeError } from '@specd/core'
import { registerChangeValidate } from '../../src/commands/change/validate.js'

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

describe('change validate', () => {
  it('prints success message when no failures or warnings', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.validate.execute.mockResolvedValue({ failures: [], warnings: [] })

    const program = makeProgram()
    registerChangeValidate(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'validate', 'feat', 'auth/login'])

    expect(stdout()).toContain('validated feat/default:auth/login: all artifacts pass')
  })

  it('prints failures and exits 1 when validation fails', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.validate.execute.mockResolvedValue({
      failures: [{ artifactId: 'spec', description: 'missing required section' }],
      warnings: [],
    })

    const program = makeProgram()
    registerChangeValidate(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'validate', 'feat', 'auth/login'])
      .catch(() => {})

    expect(process.exitCode).toBe(1)
    expect(stdout()).toContain('validation failed')
    expect(stdout()).toContain('missing required section')
  })

  it('writes warnings to stdout with pass message', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.validate.execute.mockResolvedValue({
      failures: [],
      warnings: [{ artifactId: 'design', description: 'incomplete section' }],
    })

    const program = makeProgram()
    registerChangeValidate(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'validate', 'feat', 'auth/login'])

    const out = stdout()
    expect(out).toContain('pass (1 warning(s))')
    expect(out).toContain('warning: design')
    expect(out).toContain('incomplete section')
  })

  it('outputs JSON with passed flag', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.validate.execute.mockResolvedValue({ failures: [], warnings: [] })

    const program = makeProgram()
    registerChangeValidate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'validate',
      'feat',
      'auth/login',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.passed).toBe(true)
    expect(Array.isArray(parsed.failures)).toBe(true)
    expect(Array.isArray(parsed.warnings)).toBe(true)
    expect(parsed.name).toBeUndefined()
  })

  it('exits 1 when change not found', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.validate.execute.mockRejectedValue(new ChangeNotFoundError('missing'))

    const program = makeProgram()
    registerChangeValidate(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'validate', 'missing', 'auth/login'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('exits 1 when neither specPath nor --all is provided', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerChangeValidate(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'validate', 'feat']).catch(() => {})

    expect(stderr()).toContain('either <specPath> or --all is required')
    expect(process.exit).toHaveBeenCalledWith(1)
  })

  it('exits 1 when spec path is not in the change', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.validate.execute.mockRejectedValue(
      new SpecNotInChangeError('default:billing/invoices', 'feat'),
    )

    const program = makeProgram()
    registerChangeValidate(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'validate', 'feat', 'default:billing/invoices'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('outputs JSON with passed=false on failure', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.validate.execute.mockResolvedValue({
      failures: [{ artifactId: 'spec', description: 'missing section' }],
      warnings: [],
    })

    const program = makeProgram()
    registerChangeValidate(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'validate', 'feat', 'auth/login', '--format', 'json'])
      .catch(() => {})

    const parsed = JSON.parse(stdout())
    expect(parsed.passed).toBe(false)
    expect(parsed.failures.length).toBeGreaterThan(0)
    expect(parsed.failures[0].artifactId).toBe('spec')
    expect(process.exitCode).toBe(1)
  })

  // --- Batch mode tests ---

  it('rejects --all with specPath', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerChangeValidate(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'validate', 'feat', 'auth/login', '--all'])
      .catch(() => {})

    expect(stderr()).toContain('--all and <specPath> are mutually exclusive')
    expect(process.exit).toHaveBeenCalledWith(1)
  })

  it('--all validates all specIds in the change', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: { specIds: ['default:auth/login', 'default:auth/logout'] },
      artifactStatuses: [],
      lifecycle: {},
    })
    kernel.changes.validate.execute.mockResolvedValue({ failures: [], warnings: [] })

    const program = makeProgram()
    registerChangeValidate(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'validate', 'feat', '--all'])

    expect(kernel.changes.validate.execute).toHaveBeenCalledTimes(2)
    const out = stdout()
    expect(out).toContain('validated feat/default:auth/login: all artifacts pass')
    expect(out).toContain('validated feat/default:auth/logout: all artifacts pass')
    expect(out).toContain('validated 2/2 specs')
  })

  it('--all with partial failures exits 1', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: { specIds: ['default:auth/login', 'default:auth/logout'] },
      artifactStatuses: [],
      lifecycle: {},
    })
    kernel.changes.validate.execute
      .mockResolvedValueOnce({ failures: [], warnings: [] })
      .mockResolvedValueOnce({
        failures: [{ artifactId: 'specs', description: 'missing delta' }],
        warnings: [],
      })

    const program = makeProgram()
    registerChangeValidate(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'validate', 'feat', '--all'])
      .catch(() => {})

    const out = stdout()
    expect(out).toContain('validated feat/default:auth/login: all artifacts pass')
    expect(out).toContain('validation failed feat/default:auth/logout')
    expect(out).toContain('validated 1/2 specs')
    expect(process.exitCode).toBe(1)
  })

  it('--all passes --artifact to each spec', async () => {
    const { kernel } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: { specIds: ['default:auth/login', 'default:auth/logout'] },
      artifactStatuses: [],
      lifecycle: {},
    })
    kernel.changes.validate.execute.mockResolvedValue({ failures: [], warnings: [] })

    const program = makeProgram()
    registerChangeValidate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'validate',
      'feat',
      '--all',
      '--artifact',
      'proposal',
    ])

    expect(kernel.changes.validate.execute).toHaveBeenCalledWith(
      expect.objectContaining({ artifactId: 'proposal', specPath: 'default:auth/login' }),
    )
    expect(kernel.changes.validate.execute).toHaveBeenCalledWith(
      expect.objectContaining({ artifactId: 'proposal', specPath: 'default:auth/logout' }),
    )
  })

  it('--all JSON output has batch structure', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: { specIds: ['default:auth/login'] },
      artifactStatuses: [],
      lifecycle: {},
    })
    kernel.changes.validate.execute.mockResolvedValue({ failures: [], warnings: [] })

    const program = makeProgram()
    registerChangeValidate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'validate',
      'feat',
      '--all',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.passed).toBe(true)
    expect(parsed.total).toBe(1)
    expect(parsed.results).toHaveLength(1)
    expect(parsed.results[0].spec).toBe('default:auth/login')
    expect(parsed.results[0].passed).toBe(true)
  })

  it('allows --artifact without specPath for change-scoped artifacts', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.list.execute.mockResolvedValue([
      { name: 'feat', specIds: ['default:auth/login'] },
    ])
    kernel.specs.getActiveSchema.execute.mockResolvedValue({
      raw: false,
      schema: {
        name: () => 'test-schema',
        version: () => 1,
        artifacts: () => [{ id: 'design', scope: 'change', output: 'design.md' }],
      },
    })
    kernel.changes.validate.execute.mockResolvedValue({ failures: [], warnings: [] })

    const program = makeProgram()
    registerChangeValidate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'validate',
      'feat',
      '--artifact',
      'design',
    ])

    expect(kernel.changes.validate.execute).toHaveBeenCalledWith({
      name: 'feat',
      specPath: 'default:auth/login',
      artifactId: 'design',
    })
    expect(stdout()).toContain('validated feat/default:auth/login: all artifacts pass')
  })

  it('requires specPath for scope:spec artifacts even with --artifact', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.list.execute.mockResolvedValue([
      { name: 'feat', specIds: ['default:auth/login'] },
    ])
    kernel.specs.getActiveSchema.execute.mockResolvedValue({
      raw: false,
      schema: {
        name: () => 'test-schema',
        version: () => 1,
        artifacts: () => [{ id: 'specs', scope: 'spec', output: 'spec.md' }],
      },
    })

    const program = makeProgram()
    registerChangeValidate(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'validate', 'feat', '--artifact', 'specs'])
      .catch(() => {})

    expect(stderr()).toContain('<specPath> is required for scope: spec artifacts')
    expect(process.exit).toHaveBeenCalledWith(1)
  })
})
