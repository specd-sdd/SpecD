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
import { registerProjectContextSpecs } from '../../src/commands/project/context-specs.js'

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

describe('project context-specs', () => {
  it('prints project and workspaces sections in text mode', async () => {
    const { kernel, stdout } = setup()
    kernel.project.resolveContextSpecs.execute.mockResolvedValue({
      project: ['default:_global/architecture'],
      workspaces: { core: ['core:composition'] },
    })

    const program = makeProgram()
    registerProjectContextSpecs(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'context-specs'])

    const out = stdout()
    expect(out).toContain('project:')
    expect(out).toContain('default:_global/architecture')
    expect(out).toContain('workspaces:')
    expect(out).toContain('core:')
    expect(out).toContain('core:composition')
  })

  it('omits project section with --workspaces-only in text mode', async () => {
    const { kernel, stdout } = setup()
    kernel.project.resolveContextSpecs.execute.mockResolvedValue({
      project: [],
      workspaces: { core: ['core:composition'] },
    })

    const program = makeProgram()
    registerProjectContextSpecs(program.command('project'))
    await program.parseAsync([
      'node',
      'specd',
      'project',
      'context-specs',
      '--workspaces-only',
      '--workspace',
      'core',
    ])

    expect(kernel.project.resolveContextSpecs.execute).toHaveBeenCalledWith({
      workspaces: ['core'],
      workspacesOnly: true,
    })
    const out = stdout()
    expect(out).not.toMatch(/^project:/m)
    expect(out).toContain('workspaces:')
  })

  it('keeps empty project array in toon with --workspaces-only', async () => {
    const { kernel, stdout } = setup()
    kernel.project.resolveContextSpecs.execute.mockResolvedValue({
      project: [],
      workspaces: { core: [] },
    })

    const program = makeProgram()
    registerProjectContextSpecs(program.command('project'))
    await program.parseAsync([
      'node',
      'specd',
      'project',
      'context-specs',
      '--workspaces-only',
      '--format',
      'toon',
    ])

    expect(stdout()).toMatch(/project\[0\]:/)
  })

  it('passes repeatable --workspace values through', async () => {
    const { kernel } = setup()
    kernel.project.resolveContextSpecs.execute.mockResolvedValue({
      project: [],
      workspaces: { core: [], cli: [] },
    })

    const program = makeProgram()
    registerProjectContextSpecs(program.command('project'))
    await program.parseAsync([
      'node',
      'specd',
      'project',
      'context-specs',
      '--workspace',
      'core',
      '--workspace',
      'cli',
    ])

    expect(kernel.project.resolveContextSpecs.execute).toHaveBeenCalledWith({
      workspaces: ['core', 'cli'],
    })
  })

  it('fails on unknown workspace via SpecdError exit 1', async () => {
    const { InvalidInputError } = await import('@specd/sdk')
    const { kernel, stderr } = setup()
    kernel.project.resolveContextSpecs.execute.mockRejectedValue(
      new InvalidInputError("Unknown workspace 'missing'"),
    )

    const program = makeProgram()
    registerProjectContextSpecs(program.command('project'))

    await expect(
      program.parseAsync(['node', 'specd', 'project', 'context-specs', '--workspace', 'missing']),
    ).rejects.toThrow(ExitSentinel)

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/^error:/m)
    expect(stderr()).not.toMatch(/^fatal:/m)
  })

  it('rejects positional workspace arguments', async () => {
    setup()
    const program = makeProgram()
    registerProjectContextSpecs(program.command('project'))

    await expect(
      program.parseAsync(['node', 'specd', 'project', 'context-specs', 'core']),
    ).rejects.toThrow()
  })
})
