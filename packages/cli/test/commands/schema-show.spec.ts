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

/** Minimal mock artifact with all required fields. */
function mockArtifact(overrides: Record<string, unknown> = {}) {
  return {
    id: 'spec',
    scope: 'spec',
    optional: false,
    requires: [] as string[],
    format: 'markdown',
    delta: false,
    description: undefined as string | undefined,
    output: 'spec.md',
    template: undefined as string | undefined,
    templateRef: undefined as string | undefined,
    instruction: undefined as string | undefined,
    deltaInstruction: undefined as string | undefined,
    validations: [] as unknown[],
    deltaValidations: [] as unknown[],
    preHashCleanup: [] as unknown[],
    taskCompletionCheck: undefined as unknown,
    rules: undefined as unknown,
    ...overrides,
  }
}

/** Minimal mock schema with all required methods. */
function mockSchema(overrides: Record<string, unknown> = {}) {
  return {
    name: () => 'specd-std',
    version: () => 1,
    kind: () => 'schema',
    extendsRef: () => undefined,
    metadataExtraction: () => undefined,
    artifacts: () => [] as ReturnType<typeof mockArtifact>[],
    workflow: () =>
      [] as Array<{
        step: string
        requires: string[]
        requiresTaskCompletion: string[]
        hooks: { pre: unknown[]; post: unknown[] }
      }>,
    ...overrides,
  }
}

/** Minimal mock workflow step. */
function mockWorkflowStep(overrides: Record<string, unknown> = {}) {
  return {
    step: 'designing',
    requires: [] as string[],
    requiresTaskCompletion: [] as string[],
    hooks: { pre: [], post: [] },
    ...overrides,
  }
}

function mockResult(schemaOverrides: Record<string, unknown> = {}) {
  return { raw: false as const, schema: mockSchema(schemaOverrides) }
}

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
    kernel.specs.getActiveSchema.execute.mockResolvedValue(
      mockResult({
        artifacts: () => [mockArtifact()],
        workflow: () => [mockWorkflowStep()],
      }),
    )

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
    kernel.specs.getActiveSchema.execute.mockResolvedValue(
      mockResult({
        artifacts: () => [
          mockArtifact({ id: 'proposal', optional: true, output: 'proposal.md' }),
          mockArtifact({ id: 'spec', optional: false }),
        ],
      }),
    )

    const program = makeProgram()
    registerSchemaShow(program.command('schema'))
    await program.parseAsync(['node', 'specd', 'schema', 'show'])

    const out = stdout()
    expect(out).toMatch(/proposal.*optional/)
    expect(out).toMatch(/spec.*required/)
  })

  it('Requires listed for artifacts', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getActiveSchema.execute.mockResolvedValue(
      mockResult({
        artifacts: () => [mockArtifact({ requires: ['proposal'] })],
      }),
    )

    const program = makeProgram()
    registerSchemaShow(program.command('schema'))
    await program.parseAsync(['node', 'specd', 'schema', 'show'])

    const out = stdout()
    expect(out).toMatch(/spec.*requires=\[proposal\]/)
  })

  it('Empty requires omitted in text mode', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getActiveSchema.execute.mockResolvedValue(
      mockResult({
        artifacts: () => [mockArtifact({ id: 'proposal', optional: true, output: 'proposal.md' })],
      }),
    )

    const program = makeProgram()
    registerSchemaShow(program.command('schema'))
    await program.parseAsync(['node', 'specd', 'schema', 'show'])

    const out = stdout()
    const proposalLine = out.split('\n').find((l: string) => l.includes('proposal'))
    expect(proposalLine).toBeDefined()
    expect(proposalLine).not.toContain('requires=')
  })

  it('JSON output structure', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getActiveSchema.execute.mockResolvedValue(
      mockResult({
        artifacts: () => [mockArtifact({ requires: ['proposal'] })],
        workflow: () => [mockWorkflowStep({ requires: ['spec'] })],
      }),
    )

    const program = makeProgram()
    registerSchemaShow(program.command('schema'))
    await program.parseAsync(['node', 'specd', 'schema', 'show', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.schema).toBeDefined()
    expect(parsed.artifacts).toBeDefined()
    expect(parsed.workflow).toBeDefined()
    expect(parsed.schema.name).toBe('specd-std')
    expect(parsed.schema.version).toBe(1)
    expect(parsed.artifacts[0].id).toBe('spec')
    expect(parsed.artifacts[0].scope).toBe('spec')
    expect(typeof parsed.artifacts[0].optional).toBe('boolean')
    expect(Array.isArray(parsed.artifacts[0].requires)).toBe(true)
    expect(parsed.artifacts[0].format).toBe('markdown')
    expect(typeof parsed.artifacts[0].delta).toBe('boolean')
    expect(parsed.workflow[0].step).toBe('designing')
    expect(Array.isArray(parsed.workflow[0].requires)).toBe(true)
  })

  it('JSON output includes all artifact fields', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getActiveSchema.execute.mockResolvedValue(
      mockResult({
        artifacts: () => [
          mockArtifact({
            id: 'tasks',
            scope: 'change',
            description: 'Implementation checklist',
            output: 'tasks.md',
            taskCompletionCheck: {
              incompletePattern: '- \\[ \\]',
              completePattern: '- \\[x\\]',
            },
          }),
          mockArtifact({
            id: 'proposal',
            scope: 'change',
            optional: true,
            output: 'proposal.md',
          }),
        ],
      }),
    )

    const program = makeProgram()
    registerSchemaShow(program.command('schema'))
    await program.parseAsync(['node', 'specd', 'schema', 'show', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    const tasks = parsed.artifacts.find((a: { id: string }) => a.id === 'tasks')
    expect(tasks.description).toBe('Implementation checklist')
    expect(tasks.output).toBe('tasks.md')
    expect(tasks.taskCompletionCheck).toEqual({
      incompletePattern: '- \\[ \\]',
      completePattern: '- \\[x\\]',
    })

    const proposal = parsed.artifacts.find((a: { id: string }) => a.id === 'proposal')
    expect(proposal.description).toBeNull()
    expect(proposal.taskCompletionCheck).toBeNull()
  })

  it('Text output includes output and description', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getActiveSchema.execute.mockResolvedValue(
      mockResult({
        artifacts: () => [
          mockArtifact({
            id: 'tasks',
            scope: 'change',
            description: 'Implementation checklist',
            output: 'tasks.md',
          }),
        ],
      }),
    )

    const program = makeProgram()
    registerSchemaShow(program.command('schema'))
    await program.parseAsync(['node', 'specd', 'schema', 'show'])

    const out = stdout()
    expect(out).toContain('output=tasks.md')
    expect(out).toContain('[Implementation checklist]')
  })

  it('JSON shows templateRef by default', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getActiveSchema.execute.mockResolvedValue(
      mockResult({
        artifacts: () => [
          mockArtifact({
            templateRef: 'templates/spec.md',
            template: '# Full template content',
          }),
        ],
      }),
    )

    const program = makeProgram()
    registerSchemaShow(program.command('schema'))
    await program.parseAsync(['node', 'specd', 'schema', 'show', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.artifacts[0].template).toBe('templates/spec.md')
  })

  it('JSON shows template content with --templates', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getActiveSchema.execute.mockResolvedValue(
      mockResult({
        artifacts: () => [
          mockArtifact({
            templateRef: 'templates/spec.md',
            template: '# Full template content',
          }),
        ],
      }),
    )

    const program = makeProgram()
    registerSchemaShow(program.command('schema'))
    await program.parseAsync(['node', 'specd', 'schema', 'show', '--templates', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.artifacts[0].template).toBe('# Full template content')
  })
})

describe('Ref mode', () => {
  it('[ref] argument dispatches with mode ref', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getActiveSchema.execute.mockResolvedValue(mockResult())

    const program = makeProgram()
    registerSchemaShow(program.command('schema'))
    await program.parseAsync(['node', 'specd', 'schema', 'show', '@specd/schema-std'])

    expect(kernel.specs.getActiveSchema.execute).toHaveBeenCalledWith(
      { mode: 'ref', ref: '@specd/schema-std' },
      { raw: undefined, resolveTemplates: false },
    )
    expect(stdout()).toContain('specd-std')
  })

  it('JSON output includes mode ref', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getActiveSchema.execute.mockResolvedValue(mockResult())

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
    kernel.specs.getActiveSchema.execute.mockResolvedValue(mockResult({ name: () => 'my-schema' }))

    const program = makeProgram()
    registerSchemaShow(program.command('schema'))
    await program.parseAsync(['node', 'specd', 'schema', 'show', '--file', '/tmp/schema.yaml'])

    expect(kernel.specs.getActiveSchema.execute).toHaveBeenCalledWith(
      { mode: 'file', filePath: '/tmp/schema.yaml' },
      { raw: undefined, resolveTemplates: false },
    )
    expect(stdout()).toContain('my-schema')
  })

  it('JSON output includes mode file', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getActiveSchema.execute.mockResolvedValue(mockResult({ name: () => 'my-schema' }))

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
