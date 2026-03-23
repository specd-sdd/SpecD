/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockChange,
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
import { registerProjectOverview } from '../../src/commands/project/overview.js'

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

describe('project overview', () => {
  it('outputs JSON with expected fields', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.list.execute.mockResolvedValue([
      { workspace: 'default', path: 'auth/login', title: 'Login' },
      { workspace: 'default', path: 'auth/register', title: 'Register' },
    ])
    kernel.changes.list.execute.mockResolvedValue([
      makeMockChange({ name: 'feat-a', state: 'designing' }),
    ])
    kernel.changes.listDrafts.execute.mockResolvedValue([
      makeMockChange({ name: 'feat-b', state: 'designing' }),
    ])
    kernel.changes.listDiscarded.execute.mockResolvedValue([])

    const program = makeProgram()
    registerProjectOverview(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'overview', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.projectRoot).toBe('/project')
    expect(parsed.schemaRef).toBe('@specd/schema-std')
    expect(Array.isArray(parsed.workspaces)).toBe(true)
    expect(parsed.specs.total).toBe(2)
    expect(parsed.specs.byWorkspace.default).toBe(2)
    expect(parsed.changes.active).toBe(1)
    expect(parsed.changes.drafts).toBe(1)
    expect(parsed.changes.discarded).toBe(0)
  })

  it('queries all four data sources', async () => {
    const { kernel } = setup()
    captureStdout()

    const program = makeProgram()
    registerProjectOverview(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'overview', '--format', 'json'])

    expect(kernel.specs.list.execute).toHaveBeenCalled()
    expect(kernel.changes.list.execute).toHaveBeenCalled()
    expect(kernel.changes.listDrafts.execute).toHaveBeenCalled()
    expect(kernel.changes.listDiscarded.execute).toHaveBeenCalled()
  })

  it('handles empty project (no specs, no changes)', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerProjectOverview(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'overview', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.specs.total).toBe(0)
    expect(parsed.changes.active).toBe(0)
    expect(parsed.changes.drafts).toBe(0)
    expect(parsed.changes.discarded).toBe(0)
  })

  it('exits 1 when config is missing', async () => {
    const { stderr } = setup()
    vi.mocked(loadConfig).mockRejectedValue(new Error('specd.yaml not found'))

    const program = makeProgram()
    registerProjectOverview(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'overview']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(expect.any(Number))
    expect(stderr()).toMatch(/error:|fatal:/)
  })

  it('JSON output contains no banner or box characters', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.list.execute.mockResolvedValue([
      { workspace: 'default', path: 'auth/login', title: 'Login' },
    ])
    kernel.changes.list.execute.mockResolvedValue([])
    kernel.changes.listDrafts.execute.mockResolvedValue([])
    kernel.changes.listDiscarded.execute.mockResolvedValue([])

    const program = makeProgram()
    registerProjectOverview(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'overview', '--format', 'json'])

    const out = stdout()
    // No box-drawing characters
    expect(out).not.toMatch(/[╭╮╰╯│─┌┐└┘├┤┬┴┼]/)
    // No ANSI escape codes
    expect(out).not.toMatch(/\x1b\[/)
  })

  it('renders text dashboard without errors', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.list.execute.mockResolvedValue([
      { workspace: 'default', path: 'auth/login', title: 'Login' },
    ])
    kernel.changes.list.execute.mockResolvedValue([
      makeMockChange({ name: 'feat-a', state: 'designing' }),
    ])

    const program = makeProgram()
    registerProjectOverview(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'overview'])

    const out = stdout()
    expect(out).toContain('/project')
    expect(out).toContain('@specd/schema-std')
    expect(out).toContain('default')
  })
})
