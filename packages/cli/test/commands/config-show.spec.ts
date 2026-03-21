/* eslint-disable @typescript-eslint/unbound-method */

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from './helpers.js'

vi.mock('../../src/load-config.js', () => ({ loadConfig: vi.fn() }))

import { loadConfig } from '../../src/load-config.js'
import { ConfigValidationError } from '@specd/core'
import { registerConfigShow } from '../../src/commands/config/show.js'

function setup() {
  const config = makeMockConfig()
  vi.mocked(loadConfig).mockResolvedValue(config)
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('Output format', () => {
  it('Text output shows all sections', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await program.parseAsync(['node', 'specd', 'config', 'show'])

    const out = stdout()
    expect(out).toContain('projectRoot:')
    expect(out).toContain('/project')
    expect(out).toContain('schemaRef:')
    expect(out).toContain('approvals:')
    expect(out).toContain('workspaces:')
    expect(out).toContain('storage:')
    // All paths are absolute (start with /)
    expect(out).toMatch(/\/project/)
    expect(out).toMatch(/\/project\/.specd\/changes/)
  })

  it('Approval gates shown correctly', async () => {
    const config = makeMockConfig({ approvals: { spec: true, signoff: false } })
    vi.mocked(loadConfig).mockResolvedValue(config)
    const stdout = captureStdout()
    captureStderr()
    mockProcessExit()

    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await program.parseAsync(['node', 'specd', 'config', 'show'])

    const out = stdout()
    expect(out).toContain('spec=true')
    expect(out).toContain('signoff=false')
  })

  it('JSON output is full SpecdConfig', async () => {
    const config = makeMockConfig({
      workflow: [
        {
          step: 'implementing',
          hooks: {
            pre: [],
            post: [{ id: 'run-tests', type: 'run' as const, command: 'pnpm test' }],
          },
        },
      ],
      contextIncludeSpecs: ['default:*'],
      context: [{ file: 'AGENTS.md' }],
      llmOptimizedContext: true,
    })
    vi.mocked(loadConfig).mockResolvedValue(config)
    const stdout = captureStdout()
    captureStderr()
    mockProcessExit()

    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await program.parseAsync(['node', 'specd', 'config', 'show', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.projectRoot).toBe('/project')
    expect(parsed.schemaRef).toBeDefined()
    expect(Array.isArray(parsed.workspaces)).toBe(true)
    expect(parsed.storage).toBeDefined()
    expect(parsed.approvals).toBeDefined()
    expect(parsed.workflow).toHaveLength(1)
    expect(parsed.workflow[0].step).toBe('implementing')
    expect(parsed.contextIncludeSpecs).toEqual(['default:*'])
    expect(parsed.context).toEqual([{ file: 'AGENTS.md' }])
    expect(parsed.llmOptimizedContext).toBe(true)
    // All path values are absolute strings
    expect(parsed.projectRoot).toMatch(/^\//)
    expect(parsed.storage.changesPath).toMatch(/^\//)
  })

  it('Optional fields omitted when not set', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await program.parseAsync(['node', 'specd', 'config', 'show', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.workflow).toBeUndefined()
    expect(parsed.context).toBeUndefined()
    expect(parsed.schemaOverrides).toBeUndefined()
    expect(parsed.schemaPlugins).toBeUndefined()
    expect(parsed.llmOptimizedContext).toBeUndefined()
  })

  it('Workspace entries include all fields', async () => {
    const config = makeMockConfig({
      workspaces: [
        {
          name: 'core',
          specsPath: '/project/specs/core',
          schemasPath: '/project/schemas',
          codeRoot: '/project/packages/core',
          ownership: 'owned' as const,
          isExternal: false,
          prefix: 'core',
        },
      ],
    })
    vi.mocked(loadConfig).mockResolvedValue(config)
    const stdout = captureStdout()
    captureStderr()
    mockProcessExit()

    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await program.parseAsync(['node', 'specd', 'config', 'show', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.workspaces[0].schemasPath).toBe('/project/schemas')
    expect(parsed.workspaces[0].codeRoot).toBe('/project/packages/core')
    expect(parsed.workspaces[0].prefix).toBe('core')
  })

  it('Multiple workspaces listed', async () => {
    const config = makeMockConfig({
      workspaces: [
        {
          name: 'default',
          specsPath: '/project/specs',
          schemasPath: null,
          codeRoot: '/project',
          ownership: 'owned' as const,
          isExternal: false,
        },
        {
          name: 'billing-ws',
          specsPath: '/project/billing/specs',
          schemasPath: null,
          codeRoot: '/project/billing',
          ownership: 'owned' as const,
          isExternal: false,
        },
      ],
    })
    vi.mocked(loadConfig).mockResolvedValue(config)
    const stdout = captureStdout()
    captureStderr()
    mockProcessExit()

    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await program.parseAsync(['node', 'specd', 'config', 'show'])

    const out = stdout()
    expect(out).toContain('default')
    expect(out).toContain('billing-ws')
    expect(out).toContain('/project/specs')
    expect(out).toContain('/project/billing/specs')
  })
})

describe('Error cases', () => {
  it('Config not found', async () => {
    const { stderr } = setup()
    vi.mocked(loadConfig).mockRejectedValue(
      new ConfigValidationError('/missing/specd.yaml', 'no config file found'),
    )

    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await program.parseAsync(['node', 'specd', 'config', 'show']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })
})
