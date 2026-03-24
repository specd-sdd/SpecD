/* eslint-disable @typescript-eslint/unbound-method */

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
  ExitSentinel,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerSchemaValidate } from '../../src/commands/schema/validate.js'

function makeSchema(
  overrides: {
    name?: string
    version?: number
    artifactCount?: number
    workflowStepCount?: number
  } = {},
) {
  const name = overrides.name ?? 'test-schema'
  const version = overrides.version ?? 1
  const artifacts = Array.from({ length: overrides.artifactCount ?? 3 }, (_, i) => ({
    id: `artifact-${i}`,
  }))
  const workflow = Array.from({ length: overrides.workflowStepCount ?? 2 }, (_, i) => ({
    step: `step-${i}`,
  }))
  return {
    name: () => name,
    version: () => version,
    artifacts: () => artifacts,
    workflow: () => workflow,
  }
}

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({ config, kernel })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

async function run(args: string[]): Promise<void> {
  const program = makeProgram()
  registerSchemaValidate(program.command('schema'))
  try {
    await program.parseAsync(['node', 'specd', 'schema', 'validate', ...args])
  } catch (err) {
    if (err instanceof ExitSentinel) return
    throw err
  }
}

afterEach(() => vi.restoreAllMocks())

describe('Mode routing', () => {
  it('no flags calls validateSchema with project mode', async () => {
    const { kernel } = setup()
    kernel.specs.validateSchema.execute.mockResolvedValue({
      valid: true,
      schema: makeSchema(),
      warnings: [],
    })

    await run([])

    expect(kernel.specs.validateSchema.execute).toHaveBeenCalledWith({ mode: 'project' })
  })

  it('--raw calls validateSchema with project-raw mode', async () => {
    const { kernel } = setup()
    kernel.specs.validateSchema.execute.mockResolvedValue({
      valid: true,
      schema: makeSchema(),
      warnings: [],
    })

    await run(['--raw'])

    expect(kernel.specs.validateSchema.execute).toHaveBeenCalledWith({ mode: 'project-raw' })
  })

  it('--file calls validateSchema with file mode', async () => {
    const { kernel } = setup()
    kernel.specs.validateSchema.execute.mockResolvedValue({
      valid: true,
      schema: makeSchema(),
      warnings: [],
    })

    await run(['--file', './my-schema.yaml'])

    const call = kernel.specs.validateSchema.execute.mock.calls[0]![0]
    expect(call.mode).toBe('file')
    expect(call.filePath).toContain('my-schema.yaml')
  })

  it('--file and --raw together errors', async () => {
    const { stderr } = setup()

    await run(['--file', './schema.yaml', '--raw'])

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('--file and --raw are mutually exclusive')
  })
})

describe('Success output', () => {
  it('project mode success text — no suffix', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.validateSchema.execute.mockResolvedValue({
      valid: true,
      schema: makeSchema({ name: 'my-schema', version: 1, artifactCount: 5, workflowStepCount: 4 }),
      warnings: [],
    })

    await run([])

    expect(process.exit).not.toHaveBeenCalled()
    expect(stdout()).toBe('schema valid: my-schema v1 (5 artifacts, 4 workflow steps)\n')
  })

  it('project-raw mode success text includes [raw]', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.validateSchema.execute.mockResolvedValue({
      valid: true,
      schema: makeSchema({ name: 'my-schema', version: 1 }),
      warnings: [],
    })

    await run(['--raw'])

    expect(stdout()).toContain('[raw]')
  })

  it('file mode success text includes [file]', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.validateSchema.execute.mockResolvedValue({
      valid: true,
      schema: makeSchema({ name: 'my-schema', version: 1 }),
      warnings: [],
    })

    await run(['--file', './schema.yaml'])

    expect(stdout()).toContain('[file]')
  })

  it('JSON success contains expected keys', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.validateSchema.execute.mockResolvedValue({
      valid: true,
      schema: makeSchema({ name: 'my-schema', version: 1, artifactCount: 5, workflowStepCount: 4 }),
      warnings: [],
    })

    await run(['--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(parsed.schema).toEqual({ name: 'my-schema', version: 1 })
    expect(parsed.artifacts).toBe(5)
    expect(parsed.workflowSteps).toBe(4)
    expect(parsed.mode).toBe('project')
    expect(parsed.warnings).toEqual([])
  })
})

describe('Failure output', () => {
  it('invalid schema exits 1 with failure text', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.validateSchema.execute.mockResolvedValue({
      valid: false,
      errors: ['bad artifact ID'],
      warnings: [],
    })

    await run([])

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stdout()).toContain('schema validation failed:')
    expect(stdout()).toContain('  bad artifact ID')
  })

  it('JSON failure contains error details', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.validateSchema.execute.mockResolvedValue({
      valid: false,
      errors: ['validation error msg'],
      warnings: [],
    })

    await run(['--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('error')
    expect(parsed.errors[0].message).toBe('validation error msg')
    expect(parsed.mode).toBe('project')
  })
})

describe('Config required', () => {
  it('no config discoverable reports error', async () => {
    vi.mocked(resolveCliContext).mockRejectedValue(new Error('config not found'))
    const stderr = captureStderr()
    mockProcessExit()

    await run([])

    expect(process.exit).toHaveBeenCalled()
    expect(stderr()).toContain('fatal:')
  })
})
