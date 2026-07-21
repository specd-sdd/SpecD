import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from './helpers.js'
import {
  ConfigValidationError,
  openSpecdHost,
  buildProjectStatusSnapshot,
  type BuildProjectStatusSnapshotResult,
} from '@specd/sdk'
import { registerProjectDashboard } from '../../src/commands/project/dashboard.js'
import { registerProjectStatus } from '../../src/commands/project/status.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  buildCliKernelOptions: vi.fn(() => ({})),
}))

vi.mock('@specd/sdk', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@specd/sdk')>()
  return {
    ...mod,
    openSpecdHost: vi.fn(),
    buildProjectStatusSnapshot: vi.fn(),
  }
})

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  Object.assign(kernel, {
    project: {
      listWorkspaces: vi.fn().mockResolvedValue([
        {
          name: 'default',
          prefix: '_global',
          ownership: 'owned',
          codeRoot: '/project',
          isExternal: false,
        },
      ]),
      getProjectContext: vi.fn().mockResolvedValue({ warnings: [], contextEntries: [], specs: [] }),
    },
  })

  const mockSnapshot: BuildProjectStatusSnapshotResult = {
    summary: {
      activeCount: 1,
      draftCount: 1,
      discardedCount: 0,
      archivedCount: 5,
      specsByWorkspace: { default: 2 },
      workspaceCount: 1,
    },
    graphHealth: {
      currentRef: 'abc1234',
      documentCount: 5,
      specCount: 2,
      lastIndexedRef: 'abc1234',
      graphFingerprint: 'fp123',
      lastIndexedAt: '2026-07-20T12:00:00.000Z',
      stale: false,
      fingerprintMismatch: false,
      fileCount: 10,
      symbolCount: 50,
      relationCounts: {
        IMPORTS: 0,
        DEFINES: 0,
        CALLS: 0,
        CONSTRUCTS: 0,
        USES_TYPE: 0,
        EXPORTS: 0,
        DEPENDS_ON: 0,
        COVERS_FILE: 0,
        COVERS_SYMBOL: 0,
        EXTENDS: 0,
        IMPLEMENTS: 0,
        OVERRIDES: 0,
      },
      languages: ['typescript'],
    },
    approvals: { specEnabled: false, signoffEnabled: false },
    llmOptimizedContext: false,
  }

  vi.mocked(openSpecdHost).mockResolvedValue({
    config,
    configFilePath: '/project/specd.yaml',
    kernel,
    createGraphProvider: vi.fn(),
  })
  vi.mocked(buildProjectStatusSnapshot).mockResolvedValue(mockSnapshot)

  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, mockSnapshot, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('project dashboard', () => {
  it('command name is dashboard', async () => {
    setup()

    const program = makeProgram()
    const projectCmd = program.command('project')
    registerProjectDashboard(projectCmd)

    const dashboardCmd = projectCmd.commands.find((c) => c.name() === 'dashboard')
    expect(dashboardCmd).toBeDefined()
    expect(projectCmd.commands.find((c) => c.name() === 'overview')).toBeUndefined()
  })

  it('delegates non-text formats to project status', async () => {
    setup()

    const program = makeProgram()
    const projectCmd = program.command('project')
    registerProjectStatus(projectCmd)
    registerProjectDashboard(projectCmd)

    const stdout = captureStdout()
    await program.parseAsync(['node', 'specd', 'project', 'dashboard', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.projectRoot).toBe('/project')
    expect(parsed.schemaRef).toBe('@specd/schema-std')
    expect(Array.isArray(parsed.workspaces)).toBe(true)
    expect(parsed.specs.total).toBe(2)
    expect(parsed.changes.archived).toBe(5)
  })

  it('JSON output contains no banner, config line, or box characters', async () => {
    setup()

    const program = makeProgram()
    const projectCmd = program.command('project')
    registerProjectStatus(projectCmd)
    registerProjectDashboard(projectCmd)

    const stdout = captureStdout()
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

  it('text output includes banner before box', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerProjectDashboard(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'dashboard'])

    const out = stdout()
    expect(out).toMatch(/┌─┐/)
    const bannerIdx = out.indexOf('┌─┐')
    const boxenIdx = out.indexOf('╭')
    expect(bannerIdx).toBeLessThan(boxenIdx)
  })

  it('text output contains project root, schema, workspaces, archived changes, and graph info', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerProjectDashboard(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'dashboard'])

    const out = stdout()
    expect(out).toContain('/project')
    expect(out).toContain('@specd/schema-std')
    expect(out).toContain('default')
    expect(out).toContain('archived')
    expect(out).toContain('Graph')
    expect(out).toContain('freshness:')
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

  it('project root and workspaces wrap when longer than box width', async () => {
    const config = makeMockConfig({
      projectRoot: '/very/long/path/that/definitely/exceeds/the/project/box/width/limit',
    })
    const mockSnapshot: BuildProjectStatusSnapshotResult = {
      summary: {
        activeCount: 1,
        draftCount: 1,
        discardedCount: 0,
        archivedCount: 0,
        specsByWorkspace: { default: 2 },
        workspaceCount: 1,
      },
      graphHealth: null,
      approvals: { specEnabled: false, signoffEnabled: false },
      llmOptimizedContext: false,
    }
    vi.mocked(openSpecdHost).mockResolvedValue({
      config,
      configFilePath: '/project/specd.yaml',
      kernel: makeMockKernel(),
      createGraphProvider: vi.fn(),
    })
    vi.mocked(buildProjectStatusSnapshot).mockResolvedValue(mockSnapshot)

    const stdout = captureStdout()
    mockProcessExit()

    const program = makeProgram()
    registerProjectDashboard(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'dashboard'])

    const out = stdout()
    expect(out).toContain('/very/long/path/that/definitely/exceeds')
    expect(out).toMatch(/╭/)
  })

  it('exits 1 when config is missing', async () => {
    const { stderr } = setup()
    vi.mocked(openSpecdHost).mockRejectedValue(
      new ConfigValidationError('specd.yaml', 'config file not found'),
    )

    const program = makeProgram()
    registerProjectDashboard(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'dashboard']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('renders all dashboard TUI inner box lines with uniform character width', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerProjectDashboard(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'dashboard'])

    const out = stdout()

    function stripAnsiCodes(s: string): string {
      return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    }

    // Extract inner sub-box lines (all lines between outer boxen borders starting with '│ │')
    const innerBoxLines = out
      .split('\n')
      .filter((line) => line.includes('│ │') || line.includes('│ ╭─') || line.includes('│ ╰─'))
      .map((line) => stripAnsiCodes(line))

    expect(innerBoxLines.length).toBeGreaterThan(0)
    const expectedSubBoxWidth = innerBoxLines[0]?.length
    for (const line of innerBoxLines) {
      expect(line.length).toBe(expectedSubBoxWidth)
    }
  })
})
