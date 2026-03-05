/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
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
import { ChangeNotFoundError, SpecNotInChangeError } from '@specd/core'
import { registerChangeValidate } from '../../src/commands/change/validate.js'

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

    expect(process.exit).toHaveBeenCalledWith(1)
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

  it('exits 1 when spec path argument is missing', async () => {
    setup()

    const program = makeProgram()
    registerChangeValidate(program.command('change'))
    await expect(
      program.parseAsync(['node', 'specd', 'change', 'validate', 'feat']),
    ).rejects.toThrow()
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
    expect(process.exit).toHaveBeenCalledWith(1)
  })
})
