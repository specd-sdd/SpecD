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

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { SchemaNotFoundError } from '@specd/core'
import { registerSchemaShow } from '../../src/commands/schema/show.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({ config, configFilePath: null, kernel })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('Output format', () => {
  it('Text output shows schema name, artifacts, and workflow', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getActiveSchema.execute.mockResolvedValue({
      name: () => 'specd-std',
      version: () => 1,
      artifacts: () => [
        {
          id: 'spec',
          scope: 'spec',
          optional: false,
          requires: [],
          format: 'markdown',
          delta: false,
          description: undefined,
          output: 'spec.md',
          taskCompletionCheck: undefined,
        },
      ],
      workflow: () => [{ step: 'designing', requires: [] }],
    })

    const program = makeProgram()
    registerSchemaShow(program.command('schema'))
    await program.parseAsync(['node', 'specd', 'schema', 'show'])

    const out = stdout()
    expect(out).toContain('specd-std')
    expect(out).toContain('1')
    expect(out).toContain('artifacts:')
    expect(out).toContain('workflow:')
  })

  it('Optional and required artifacts distinguished', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getActiveSchema.execute.mockResolvedValue({
      name: () => 'specd-std',
      version: () => 1,
      artifacts: () => [
        {
          id: 'proposal',
          scope: 'spec',
          optional: true,
          requires: [],
          format: 'markdown',
          delta: false,
          description: undefined,
          output: 'proposal.md',
          taskCompletionCheck: undefined,
        },
        {
          id: 'spec',
          scope: 'spec',
          optional: false,
          requires: [],
          format: 'markdown',
          delta: false,
          description: undefined,
          output: 'spec.md',
          taskCompletionCheck: undefined,
        },
      ],
      workflow: () => [],
    })

    const program = makeProgram()
    registerSchemaShow(program.command('schema'))
    await program.parseAsync(['node', 'specd', 'schema', 'show'])

    const out = stdout()
    expect(out).toMatch(/proposal.*optional/)
    expect(out).toMatch(/spec.*required/)
  })

  it('Requires listed for artifacts', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getActiveSchema.execute.mockResolvedValue({
      name: () => 'specd-std',
      version: () => 1,
      artifacts: () => [
        {
          id: 'spec',
          scope: 'spec',
          optional: false,
          requires: ['proposal'],
          format: 'markdown',
          delta: false,
          description: undefined,
          output: 'spec.md',
          taskCompletionCheck: undefined,
        },
      ],
      workflow: () => [],
    })

    const program = makeProgram()
    registerSchemaShow(program.command('schema'))
    await program.parseAsync(['node', 'specd', 'schema', 'show'])

    const out = stdout()
    expect(out).toMatch(/spec.*requires=\[proposal\]/)
  })

  it('Empty requires omitted in text mode', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getActiveSchema.execute.mockResolvedValue({
      name: () => 'specd-std',
      version: () => 1,
      artifacts: () => [
        {
          id: 'proposal',
          scope: 'spec',
          optional: true,
          requires: [],
          format: 'markdown',
          delta: false,
          description: undefined,
          output: 'proposal.md',
          taskCompletionCheck: undefined,
        },
      ],
      workflow: () => [],
    })

    const program = makeProgram()
    registerSchemaShow(program.command('schema'))
    await program.parseAsync(['node', 'specd', 'schema', 'show'])

    const out = stdout()
    // Find the proposal line and verify it does not contain a requires field
    const proposalLine = out.split('\n').find((l: string) => l.includes('proposal'))
    expect(proposalLine).toBeDefined()
    expect(proposalLine).not.toContain('requires=')
  })

  it('JSON output structure', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getActiveSchema.execute.mockResolvedValue({
      name: () => 'specd-std',
      version: () => 1,
      artifacts: () => [
        {
          id: 'spec',
          scope: 'spec',
          optional: false,
          requires: ['proposal'],
          format: 'markdown',
          delta: false,
          description: undefined,
          output: 'spec.md',
          taskCompletionCheck: undefined,
        },
      ],
      workflow: () => [{ step: 'designing', requires: ['spec'] }],
    })

    const program = makeProgram()
    registerSchemaShow(program.command('schema'))
    await program.parseAsync(['node', 'specd', 'schema', 'show', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    // Top-level keys
    expect(parsed.schema).toBeDefined()
    expect(parsed.artifacts).toBeDefined()
    expect(parsed.workflow).toBeDefined()
    // schema has name and version
    expect(parsed.schema.name).toBe('specd-std')
    expect(parsed.schema.version).toBe(1)
    // Each artifact entry has required fields
    expect(parsed.artifacts[0].id).toBe('spec')
    expect(parsed.artifacts[0].scope).toBe('spec')
    expect(typeof parsed.artifacts[0].optional).toBe('boolean')
    expect(Array.isArray(parsed.artifacts[0].requires)).toBe(true)
    expect(parsed.artifacts[0].format).toBe('markdown')
    expect(typeof parsed.artifacts[0].delta).toBe('boolean')
    // Each workflow entry has step and requires
    expect(parsed.workflow[0].step).toBe('designing')
    expect(Array.isArray(parsed.workflow[0].requires)).toBe(true)
  })

  it('JSON output includes description, output, and hasTaskCompletionCheck', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getActiveSchema.execute.mockResolvedValue({
      name: () => 'specd-std',
      version: () => 1,
      artifacts: () => [
        {
          id: 'tasks',
          scope: 'change',
          optional: false,
          requires: [],
          format: 'markdown',
          delta: false,
          description: 'Implementation checklist',
          output: 'tasks.md',
          taskCompletionCheck: {
            incompletePattern: '- \\[ \\]',
            completePattern: '- \\[x\\]',
          },
        },
        {
          id: 'proposal',
          scope: 'change',
          optional: true,
          requires: [],
          format: 'markdown',
          delta: false,
          description: undefined,
          output: 'proposal.md',
          taskCompletionCheck: undefined,
        },
      ],
      workflow: () => [],
    })

    const program = makeProgram()
    registerSchemaShow(program.command('schema'))
    await program.parseAsync(['node', 'specd', 'schema', 'show', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    const tasks = parsed.artifacts.find((a: { id: string }) => a.id === 'tasks')
    expect(tasks.description).toBe('Implementation checklist')
    expect(tasks.output).toBe('tasks.md')
    expect(tasks.hasTaskCompletionCheck).toBe(true)

    const proposal = parsed.artifacts.find((a: { id: string }) => a.id === 'proposal')
    expect(proposal.description).toBeNull()
    expect(proposal.hasTaskCompletionCheck).toBe(false)
  })

  it('Text output includes output and description', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getActiveSchema.execute.mockResolvedValue({
      name: () => 'specd-std',
      version: () => 1,
      artifacts: () => [
        {
          id: 'tasks',
          scope: 'change',
          optional: false,
          requires: [],
          format: 'markdown',
          delta: false,
          description: 'Implementation checklist',
          output: 'tasks.md',
          taskCompletionCheck: undefined,
        },
      ],
      workflow: () => [],
    })

    const program = makeProgram()
    registerSchemaShow(program.command('schema'))
    await program.parseAsync(['node', 'specd', 'schema', 'show'])

    const out = stdout()
    expect(out).toContain('output=tasks.md')
    expect(out).toContain('[Implementation checklist]')
  })
})

describe('Ref mode', () => {
  it('[ref] argument dispatches with mode ref', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getActiveSchema.execute.mockResolvedValue({
      name: () => 'specd-std',
      version: () => 1,
      artifacts: () => [],
      workflow: () => [],
    })

    const program = makeProgram()
    registerSchemaShow(program.command('schema'))
    await program.parseAsync(['node', 'specd', 'schema', 'show', '@specd/schema-std'])

    expect(kernel.specs.getActiveSchema.execute).toHaveBeenCalledWith({
      mode: 'ref',
      ref: '@specd/schema-std',
    })
    expect(stdout()).toContain('specd-std')
  })

  it('JSON output includes mode ref', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getActiveSchema.execute.mockResolvedValue({
      name: () => 'specd-std',
      version: () => 1,
      artifacts: () => [],
      workflow: () => [],
    })

    const program = makeProgram()
    registerSchemaShow(program.command('schema'))
    await program.parseAsync([
      'node',
      'specd',
      'schema',
      'show',
      '@specd/schema-std',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.mode).toBe('ref')
  })
})

describe('File mode', () => {
  it('--file dispatches with mode file', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getActiveSchema.execute.mockResolvedValue({
      name: () => 'my-schema',
      version: () => 1,
      artifacts: () => [],
      workflow: () => [],
    })

    const program = makeProgram()
    registerSchemaShow(program.command('schema'))
    await program.parseAsync(['node', 'specd', 'schema', 'show', '--file', '/tmp/schema.yaml'])

    expect(kernel.specs.getActiveSchema.execute).toHaveBeenCalledWith({
      mode: 'file',
      filePath: '/tmp/schema.yaml',
    })
    expect(stdout()).toContain('my-schema')
  })

  it('JSON output includes mode file', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getActiveSchema.execute.mockResolvedValue({
      name: () => 'my-schema',
      version: () => 1,
      artifacts: () => [],
      workflow: () => [],
    })

    const program = makeProgram()
    registerSchemaShow(program.command('schema'))
    await program.parseAsync([
      'node',
      'specd',
      'schema',
      'show',
      '--file',
      '/tmp/schema.yaml',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.mode).toBe('file')
  })
})

describe('Error cases', () => {
  it('Schema cannot be resolved', async () => {
    const { kernel, stderr } = setup()
    kernel.specs.getActiveSchema.execute.mockRejectedValue(
      new SchemaNotFoundError('nonexistent-schema'),
    )

    const program = makeProgram()
    registerSchemaShow(program.command('schema'))
    await program.parseAsync(['node', 'specd', 'schema', 'show']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(3)
    expect(stderr()).toMatch(/fatal:/)
  })

  it('Ref not found exits with code 3', async () => {
    const { kernel, stderr } = setup()
    kernel.specs.getActiveSchema.execute.mockRejectedValue(
      new SchemaNotFoundError('@nonexistent/schema'),
    )

    const program = makeProgram()
    registerSchemaShow(program.command('schema'))
    await program
      .parseAsync(['node', 'specd', 'schema', 'show', '@nonexistent/schema'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(3)
    expect(stderr()).toMatch(/fatal:/)
  })

  it('[ref] and --file are mutually exclusive', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerSchemaShow(program.command('schema'))
    await program
      .parseAsync([
        'node',
        'specd',
        'schema',
        'show',
        '@specd/schema-std',
        '--file',
        '/tmp/schema.yaml',
      ])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('[ref] and --file are mutually exclusive')
  })
})
