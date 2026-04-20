/**
 * Tests for config show, schema show, and project commands.
 */
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
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}))

import { loadConfig } from '../../src/load-config.js'
import { createCliKernel } from '../../src/kernel.js'
import { registerConfigShow } from '../../src/commands/config/show.js'
import { registerSchemaShow } from '../../src/commands/schema/show.js'
import { registerProjectContext } from '../../src/commands/project/context.js'

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

// ---------------------------------------------------------------------------
// config show
// ---------------------------------------------------------------------------

describe('config show', () => {
  it('prints project root and schema ref', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await program.parseAsync(['node', 'specd', 'config', 'show'])

    const out = stdout()
    expect(out).toContain('/project')
    expect(out).toContain('@specd/schema-std')
  })

  it('lists workspaces', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await program.parseAsync(['node', 'specd', 'config', 'show'])

    expect(stdout()).toContain('default')
  })

  it('shows approval settings', async () => {
    const config = makeMockConfig({ approvals: { spec: true, signoff: false } })
    vi.mocked(loadConfig).mockResolvedValue(config)
    vi.mocked(createCliKernel).mockResolvedValue(makeMockKernel())
    const stdout = captureStdout()
    captureStderr()

    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await program.parseAsync(['node', 'specd', 'config', 'show'])

    expect(stdout()).toContain('spec=true')
    expect(stdout()).toContain('signoff=false')
  })

  it('outputs valid JSON with expected fields', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await program.parseAsync(['node', 'specd', 'config', 'show', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.projectRoot).toBe('/project')
    expect(parsed.schemaRef).toBe('@specd/schema-std')
    expect(Array.isArray(parsed.workspaces)).toBe(true)
    expect(parsed.storage).toBeDefined()
    expect(parsed.approvals).toBeDefined()
  })

  it('lists multiple workspaces with their specsPath and ownership', async () => {
    const config = makeMockConfig({
      workspaces: [
        {
          name: 'default',
          specsPath: '/project/specs',
          specsAdapter: { adapter: 'fs', config: { path: '/project/specs' } },
          schemasPath: null,
          schemasAdapter: null,
          codeRoot: '/project',
          ownership: 'owned' as const,
          isExternal: false,
        },
        {
          name: 'billing-ws',
          specsPath: '/project/billing/specs',
          specsAdapter: { adapter: 'fs', config: { path: '/project/billing/specs' } },
          schemasPath: null,
          schemasAdapter: null,
          codeRoot: '/project/billing',
          ownership: 'shared' as const,
          isExternal: false,
        },
      ],
    })
    vi.mocked(loadConfig).mockResolvedValue(config)
    vi.mocked(createCliKernel).mockResolvedValue(makeMockKernel())
    const stdout = captureStdout()
    captureStderr()
    mockProcessExit()

    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await program.parseAsync(['node', 'specd', 'config', 'show'])

    const out = stdout()
    expect(out).toContain('default')
    expect(out).toContain('billing-ws')
  })
})

// ---------------------------------------------------------------------------
// schema show
// ---------------------------------------------------------------------------

describe('config show — extra args', () => {
  it('exits with error when unexpected argument is passed', async () => {
    setup()

    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await expect(
      program.parseAsync(['node', 'specd', 'config', 'show', 'some-arg']),
    ).rejects.toThrow()
  })
})

describe('schema show', () => {
  it('prints schema name, version, artifacts, and workflow', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getActiveSchema.execute.mockResolvedValue({
      raw: false,
      schema: {
        name: () => 'specd-std',
        version: () => 1,
        kind: () => 'schema',
        extendsRef: () => undefined,
        metadataExtraction: () => undefined,
        artifacts: () => [
          {
            id: 'spec',
            scope: 'change',
            optional: false,
            requires: [],
            format: 'markdown',
            delta: false,
            description: undefined,
            output: 'spec.md',
            template: undefined,
            templateRef: undefined,
            instruction: undefined,
            deltaInstruction: undefined,
            validations: [],
            deltaValidations: [],
            preHashCleanup: [],
            taskCompletionCheck: undefined,
            rules: undefined,
          },
          {
            id: 'design',
            scope: 'change',
            optional: false,
            requires: [],
            format: 'markdown',
            delta: false,
            description: undefined,
            output: 'design.md',
            template: undefined,
            templateRef: undefined,
            instruction: undefined,
            deltaInstruction: undefined,
            validations: [],
            deltaValidations: [],
            preHashCleanup: [],
            taskCompletionCheck: undefined,
            rules: undefined,
          },
        ],
        workflow: () => [
          {
            step: 'designing',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
          {
            step: 'implementing',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
        ],
      },
    })

    const program = makeProgram()
    registerSchemaShow(program.command('schema'))
    await program.parseAsync(['node', 'specd', 'schema', 'show'])

    const out = stdout()
    expect(out).toContain('schema: specd-std')
    expect(out).toContain('version: 1')
    expect(out).toContain('spec')
    expect(out).toContain('design')
    expect(out).toContain('designing')
    expect(out).toContain('implementing')
  })

  it('outputs valid JSON with schema object, artifacts, and workflow arrays', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getActiveSchema.execute.mockResolvedValue({
      raw: false,
      schema: {
        name: () => 'specd-std',
        version: () => 1,
        kind: () => 'schema',
        extendsRef: () => undefined,
        metadataExtraction: () => undefined,
        artifacts: () => [
          {
            id: 'spec',
            scope: 'change',
            optional: false,
            requires: [],
            format: 'markdown',
            delta: false,
            description: undefined,
            output: 'spec.md',
            template: undefined,
            templateRef: undefined,
            instruction: undefined,
            deltaInstruction: undefined,
            validations: [],
            deltaValidations: [],
            preHashCleanup: [],
            taskCompletionCheck: undefined,
            rules: undefined,
          },
        ],
        workflow: () => [
          {
            step: 'designing',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
        ],
      },
    })

    const program = makeProgram()
    registerSchemaShow(program.command('schema'))
    await program.parseAsync(['node', 'specd', 'schema', 'show', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.schema).toEqual({ name: 'specd-std', version: 1, kind: 'schema' })
    expect(Array.isArray(parsed.artifacts)).toBe(true)
    expect(parsed.artifacts[0].id).toBe('spec')
    expect(parsed.artifacts[0].scope).toBe('change')
    expect(parsed.artifacts[0].format).toBe('markdown')
    expect(Array.isArray(parsed.workflow)).toBe(true)
    expect(parsed.workflow[0].step).toBe('designing')
    expect(Array.isArray(parsed.workflow[0].requires)).toBe(true)
  })

  it('distinguishes optional and required artifacts in text output', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getActiveSchema.execute.mockResolvedValue({
      raw: false,
      schema: {
        name: () => 'specd-std',
        version: () => 1,
        kind: () => 'schema',
        extendsRef: () => undefined,
        metadataExtraction: () => undefined,
        artifacts: () => [
          {
            id: 'proposal',
            scope: 'change',
            optional: true,
            requires: [],
            format: 'markdown',
            delta: false,
            description: undefined,
            output: 'proposal.md',
            template: undefined,
            templateRef: undefined,
            instruction: undefined,
            deltaInstruction: undefined,
            validations: [],
            deltaValidations: [],
            preHashCleanup: [],
            taskCompletionCheck: undefined,
            rules: undefined,
          },
          {
            id: 'spec',
            scope: 'change',
            optional: false,
            requires: ['proposal'],
            format: 'markdown',
            delta: false,
            description: undefined,
            output: 'spec.md',
            template: undefined,
            templateRef: undefined,
            instruction: undefined,
            deltaInstruction: undefined,
            validations: [],
            deltaValidations: [],
            preHashCleanup: [],
            taskCompletionCheck: undefined,
            rules: undefined,
          },
        ],
        workflow: () => [
          {
            step: 'designing',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
        ],
      },
    })

    const program = makeProgram()
    registerSchemaShow(program.command('schema'))
    await program.parseAsync(['node', 'specd', 'schema', 'show'])

    const out = stdout()
    expect(out).toMatch(/proposal.*optional/)
    expect(out).toMatch(/spec.*required/)
  })

  it('JSON artifact entries include full fields: id, scope, optional, requires, format, delta', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getActiveSchema.execute.mockResolvedValue({
      raw: false,
      schema: {
        name: () => 'specd-std',
        version: () => 1,
        kind: () => 'schema',
        extendsRef: () => undefined,
        metadataExtraction: () => undefined,
        artifacts: () => [
          {
            id: 'spec',
            scope: 'change',
            optional: false,
            requires: ['proposal'],
            format: 'markdown',
            delta: true,
            description: undefined,
            output: 'spec.md',
            template: undefined,
            templateRef: undefined,
            instruction: undefined,
            deltaInstruction: undefined,
            validations: [],
            deltaValidations: [],
            preHashCleanup: [],
            taskCompletionCheck: undefined,
            rules: undefined,
          },
        ],
        workflow: () => [
          {
            step: 'designing',
            requires: ['spec'],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
          },
        ],
      },
    })

    const program = makeProgram()
    registerSchemaShow(program.command('schema'))
    await program.parseAsync(['node', 'specd', 'schema', 'show', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    const artifact = parsed.artifacts[0]
    expect(artifact.id).toBe('spec')
    expect(artifact.scope).toBe('change')
    expect(typeof artifact.optional).toBe('boolean')
    expect(Array.isArray(artifact.requires)).toBe(true)
    expect(artifact.format).toBe('markdown')
    expect(artifact.delta).toBe(true)
    expect(parsed.workflow[0].requires).toEqual(['spec'])
  })
})

describe('schema show — resolution failure', () => {
  it('exits 3 when schema cannot be resolved', async () => {
    const { kernel, stderr } = setup()
    const { SchemaNotFoundError } = await import('@specd/core')
    kernel.specs.getActiveSchema.execute.mockRejectedValue(
      new SchemaNotFoundError('@specd/schema-missing'),
    )

    const program = makeProgram()
    registerSchemaShow(program.command('schema'))
    await program.parseAsync(['node', 'specd', 'schema', 'show']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(3)
    expect(stderr()).toContain('fatal:')
  })
})

// ---------------------------------------------------------------------------
// project context
// ---------------------------------------------------------------------------

describe('project context', () => {
  it('prints no project context configured when nothing is configured', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerProjectContext(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'context'])

    expect(stdout()).toContain('no project context configured')
  })

  it('prints compiled context entries and spec content when present', async () => {
    const { kernel, stdout } = setup()
    kernel.project.getProjectContext.execute.mockResolvedValue({
      contextEntries: ['You are working on specd.'],
      specs: [
        {
          specId: 'default:arch/overview',
          title: 'Architecture overview',
          description: 'Overview',
          source: 'includePattern' as const,
          mode: 'full' as const,
          content: '### Spec: default:arch/overview\n\n**Description:** Overview',
        },
      ],
      warnings: [],
    })

    const program = makeProgram()
    registerProjectContext(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'context'])

    const out = stdout()
    expect(out).toContain('You are working on specd.')
    expect(out).toContain('## Spec content')
    expect(out).toContain('default:arch/overview')
  })

  it('emits warnings to stderr', async () => {
    const { kernel, stderr } = setup()
    kernel.project.getProjectContext.execute.mockResolvedValue({
      contextEntries: [],
      specs: [],
      warnings: [
        { type: 'missing-file', path: 'foo.md', message: "Context file 'foo.md' not found" },
      ],
    })

    const program = makeProgram()
    registerProjectContext(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'context'])

    expect(stderr()).toContain('warning:')
    expect(stderr()).toContain('foo.md')
  })

  it('prints context entries before spec content', async () => {
    const { kernel, stdout } = setup()
    kernel.project.getProjectContext.execute.mockResolvedValue({
      contextEntries: ['Follow conventions.'],
      specs: [
        {
          specId: 'default:arch/overview',
          title: 'Architecture overview',
          description: 'Overview',
          source: 'includePattern' as const,
          mode: 'full' as const,
          content: '### Spec: default:arch/overview',
        },
      ],
      warnings: [],
    })

    const program = makeProgram()
    registerProjectContext(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'context'])

    const out = stdout()
    expect(out.indexOf('Follow conventions.')).toBeLessThan(out.indexOf('## Spec content'))
  })

  it('prints only context entries when no specs matched', async () => {
    const { kernel, stdout } = setup()
    kernel.project.getProjectContext.execute.mockResolvedValue({
      contextEntries: ['Some instruction.'],
      specs: [],
      warnings: [],
    })

    const program = makeProgram()
    registerProjectContext(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'context'])

    const out = stdout()
    expect(out).toContain('Some instruction.')
    expect(out).not.toContain('## Spec content')
  })

  it('exits 1 when --depth is used without --follow-deps', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerProjectContext(program.command('project'))
    await program
      .parseAsync(['node', 'specd', 'project', 'context', '--depth', '2'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('outputs valid JSON with contextEntries, specs, and warnings', async () => {
    const { kernel, stdout } = setup()
    kernel.project.getProjectContext.execute.mockResolvedValue({
      contextEntries: ['You are working on specd.'],
      specs: [
        {
          specId: 'default:arch/overview',
          title: 'Architecture overview',
          description: 'Overview',
          source: 'includePattern' as const,
          mode: 'full' as const,
          content: '...',
        },
      ],
      warnings: [],
    })

    const program = makeProgram()
    registerProjectContext(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'context', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(Array.isArray(parsed.contextEntries)).toBe(true)
    expect(parsed.contextEntries[0]).toBe('You are working on specd.')
    expect(Array.isArray(parsed.specs)).toBe(true)
    expect(parsed.specs[0].specId).toBe('default:arch/overview')
    expect(parsed.specs[0].mode).toBe('full')
    expect(Array.isArray(parsed.warnings)).toBe(true)
  })
})
