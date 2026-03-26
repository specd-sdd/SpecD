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
import { registerSpecValidate } from '../../src/commands/spec/validate.js'

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

describe('spec validate', () => {
  it('prints pass message for a single spec that passes', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.validate.execute.mockResolvedValue({
      entries: [{ spec: 'default:auth/login', passed: true, failures: [], warnings: [] }],
      totalSpecs: 1,
      passed: 1,
      failed: 0,
    })

    const program = makeProgram()
    registerSpecValidate(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'validate', 'auth/login'])

    expect(stdout()).toContain('validated default:auth/login: all artifacts pass')
    expect(process.exit).not.toHaveBeenCalled()
  })

  it('exits 1 and shows errors for a single spec that fails', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.validate.execute.mockResolvedValue({
      entries: [
        {
          spec: 'default:auth/login',
          passed: false,
          failures: [{ artifactId: 'specs', description: "Required artifact 'specs' is missing" }],
          warnings: [],
        },
      ],
      totalSpecs: 1,
      passed: 0,
      failed: 1,
    })

    const program = makeProgram()
    registerSpecValidate(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'validate', 'auth/login']).catch(() => {})

    expect(stdout()).toContain('validation failed default:auth/login:')
    expect(stdout()).toContain('error: specs')
    expect(process.exitCode).toBe(1)
  })

  it('shows summary for --all when all pass', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.validate.execute.mockResolvedValue({
      entries: [
        { spec: 'default:auth/login', passed: true, failures: [], warnings: [] },
        { spec: 'default:billing/inv', passed: true, failures: [], warnings: [] },
      ],
      totalSpecs: 2,
      passed: 2,
      failed: 0,
    })

    const program = makeProgram()
    registerSpecValidate(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'validate', '--all'])

    expect(stdout()).toContain('validated 2 specs: 2 passed, 0 failed')
    expect(process.exit).not.toHaveBeenCalled()
  })

  it('exits 1 for --all when some specs fail', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.validate.execute.mockResolvedValue({
      entries: [
        { spec: 'default:auth/login', passed: true, failures: [], warnings: [] },
        {
          spec: 'default:billing/inv',
          passed: false,
          failures: [{ artifactId: 'verify', description: 'Required rule not satisfied' }],
          warnings: [],
        },
      ],
      totalSpecs: 2,
      passed: 1,
      failed: 1,
    })

    const program = makeProgram()
    registerSpecValidate(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'validate', '--all']).catch(() => {})

    expect(stdout()).toContain('validated 2 specs: 1 passed, 1 failed')
    expect(stdout()).toContain('FAIL  default:billing/inv')
    expect(process.exitCode).toBe(1)
  })

  it('filters by workspace with --workspace', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.validate.execute.mockResolvedValue({
      entries: [{ spec: 'default:auth/login', passed: true, failures: [], warnings: [] }],
      totalSpecs: 1,
      passed: 1,
      failed: 0,
    })

    const program = makeProgram()
    registerSpecValidate(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'validate', '--workspace', 'default'])

    expect(kernel.specs.validate.execute).toHaveBeenCalledWith(
      expect.objectContaining({ workspace: 'default' }),
    )
    expect(stdout()).toContain('validated 1 specs')
  })

  it('outputs JSON with result shape', async () => {
    const { kernel, stdout } = setup()
    const resultData = {
      entries: [{ spec: 'default:auth/login', passed: true, failures: [], warnings: [] }],
      totalSpecs: 1,
      passed: 1,
      failed: 0,
    }
    kernel.specs.validate.execute.mockResolvedValue(resultData)

    const program = makeProgram()
    registerSpecValidate(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'validate', '--all', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed).toHaveProperty('entries')
    expect(parsed).toHaveProperty('totalSpecs')
    expect(parsed).toHaveProperty('passed')
    expect(parsed).toHaveProperty('failed')
  })

  it('exits 1 when spec is not found', async () => {
    const { kernel, stderr } = setup()
    kernel.specs.validate.execute.mockResolvedValue({
      entries: [],
      totalSpecs: 0,
      passed: 0,
      failed: 0,
    })

    const program = makeProgram()
    registerSpecValidate(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'validate', 'nonexistent']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('error: spec not found')
  })

  it('exits 1 for unknown workspace', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerSpecValidate(program.command('spec'))
    await program
      .parseAsync(['node', 'specd', 'spec', 'validate', '--workspace', 'nonexistent'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain("error: unknown workspace 'nonexistent'")
  })

  it('errors when no scope argument is provided', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerSpecValidate(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'validate']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('error:')
  })
})
