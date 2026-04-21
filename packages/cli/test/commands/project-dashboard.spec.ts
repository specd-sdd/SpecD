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
import { ConfigValidationError } from '@specd/core'

vi.mock('../../src/load-config.js', () => ({
  loadConfig: vi.fn(),
  resolveConfigPath: vi.fn().mockResolvedValue(null),
}))
vi.mock('../../src/kernel.js', () => ({ createCliKernel: vi.fn() }))

import { loadConfig } from '../../src/load-config.js'
import { createCliKernel } from '../../src/kernel.js'
import { registerProjectDashboard } from '../../src/commands/project/dashboard.js'

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

describe('project dashboard', () => {
  it('command name is dashboard', async () => {
    const { kernel } = setup()
    kernel.specs.list.execute.mockResolvedValue([])
    kernel.changes.list.execute.mockResolvedValue([])

    const program = makeProgram()
    const projectCmd = program.command('project')
    registerProjectDashboard(projectCmd)

    const dashboardCmd = projectCmd.commands.find((c) => c.name() === 'dashboard')
    expect(dashboardCmd).toBeDefined()
    expect(projectCmd.commands.find((c) => c.name() === 'overview')).toBeUndefined()
  })

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
    registerProjectDashboard(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'dashboard', '--format', 'json'])

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

  it('JSON output contains no banner, config line, or box characters', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.list.execute.mockResolvedValue([
      { workspace: 'default', path: 'auth/login', title: 'Login' },
    ])
    kernel.changes.list.execute.mockResolvedValue([])
    kernel.changes.listDrafts.execute.mockResolvedValue([])
    kernel.changes.listDiscarded.execute.mockResolvedValue([])

    const program = makeProgram()
    registerProjectDashboard(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'dashboard', '--format', 'json'])

    const out = stdout()
    expect(out).not.toMatch(/[╭╮╰╯│─┌┐└┘├┤┬┴┼]/)
    expect(out).not.toMatch(/\x1b\[/)
    expect(out).not.toMatch(/^Using config:/m)
  })

  it('text output shows "Using config:" after banner but before box', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerProjectDashboard(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'dashboard'])

    const out = stdout()
    expect(out).toContain('Using config:')
    const bannerIdx = out.indexOf('┌─┐')
    const configIdx = out.indexOf('Using config:')
    const boxenIdx = out.indexOf('╭')
    expect(bannerIdx).toBeLessThan(configIdx)
    expect(configIdx).toBeLessThan(boxenIdx)
  })

  it('"Using config:" line shows relative path from CWD', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerProjectDashboard(program.command('project'))
    // config.projectRoot is '/project' from makeMockConfig
    await program.parseAsync(['node', 'specd', 'project', 'dashboard'])

    const out = stdout()
    // The config path should be relative (must not start with /)
    const configLine = out.split('\n').find((l) => l.startsWith('Using config:'))
    expect(configLine).toBeDefined()
    expect(configLine).not.toMatch(/^Using config: \//)
  })

  it('text output includes banner before box', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerProjectDashboard(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'dashboard'])

    const out = stdout()
    // Banner contains SpecD ASCII art (the corner char of the logo)
    expect(out).toMatch(/┌─┐/)
    // Banner appears before the boxen title
    const bannerIdx = out.indexOf('┌─┐')
    const boxenIdx = out.indexOf('╭')
    expect(bannerIdx).toBeLessThan(boxenIdx)
  })

  it('text output contains project root and schema', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerProjectDashboard(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'dashboard'])

    const out = stdout()
    expect(out).toContain('/project')
    expect(out).toContain('@specd/schema-std')
    expect(out).toContain('default')
  })

  it('text output uses "project dashboard" as boxen title', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerProjectDashboard(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'dashboard'])

    const out = stdout()
    expect(out).toContain('project dashboard')
    expect(out).not.toContain('project overview')
  })

  it('project root wraps when longer than box width', async () => {
    const config = makeMockConfig({
      projectRoot: '/very/long/path/that/definitely/exceeds/the/project/box/width/limit',
    })
    vi.mocked(loadConfig).mockResolvedValue(config)
    vi.mocked(createCliKernel).mockResolvedValue(makeMockKernel())
    const stdout = captureStdout()
    mockProcessExit()

    const program = makeProgram()
    registerProjectDashboard(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'dashboard'])

    const out = stdout()
    // The long path should be present in the output
    expect(out).toContain('/very/long/path/that/definitely/exceeds')
    // The box should still render (contains box chars)
    expect(out).toMatch(/╭/)
  })

  it('exits 1 when config is missing', async () => {
    const { stderr } = setup()
    vi.mocked(loadConfig).mockRejectedValue(
      new ConfigValidationError('specd.yaml', 'config file not found'),
    )

    const program = makeProgram()
    registerProjectDashboard(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'dashboard']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('queries all four data sources', async () => {
    const { kernel } = setup()
    captureStdout()

    const program = makeProgram()
    registerProjectDashboard(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'dashboard', '--format', 'json'])

    expect(kernel.specs.list.execute).toHaveBeenCalled()
    expect(kernel.changes.list.execute).toHaveBeenCalled()
    expect(kernel.changes.listDrafts.execute).toHaveBeenCalled()
    expect(kernel.changes.listDiscarded.execute).toHaveBeenCalled()
  })
})
