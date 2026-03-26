import { describe, it, expect, vi, afterEach } from 'vitest'
import { Command } from 'commander'
import {
  makeMockConfig,
  makeMockKernel,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from './commands/helpers.js'
import { renderBanner } from '../src/banner.js'

vi.mock('../src/load-config.js', () => ({ loadConfig: vi.fn() }))
vi.mock('../src/kernel.js', () => ({ createCliKernel: vi.fn() }))

import { loadConfig } from '../src/load-config.js'
import { createCliKernel } from '../src/kernel.js'
import { registerProjectDashboard } from '../src/commands/project/dashboard.js'

afterEach(() => vi.restoreAllMocks())

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a root Commander program that mirrors the index.ts setup:
 *   - global --config option
 *   - preAction hook that propagates root config to the action command
 *   - addHelpText with the SpecD banner prepended to root --help only
 *   - exitOverride so --help throws instead of calling process.exit
 */
function makeRootProgram(): Command {
  const program = new Command('specd')
    .exitOverride()
    .option('--config <path>', 'path to specd.yaml')

  program.addHelpText('before', renderBanner() + '\n\n')

  program.hook('preAction', (_thisCommand, actionCommand) => {
    const rootConfig = program.opts().config as string | undefined
    if (rootConfig !== undefined) {
      actionCommand.setOptionValue('config', rootConfig)
    }
  })

  return program
}

/**
 * Registers a "probe" subcommand that records the config value it receives
 * after the preAction hook fires.
 */
function addProbeCommand(program: Command): { capturedConfig: () => string | undefined } {
  let capturedConfig: string | undefined
  program
    .command('probe')
    .exitOverride()
    .allowExcessArguments(false)
    .option('--config <path>', 'config path')
    .action((opts: { config?: string }) => {
      capturedConfig = opts.config
    })
  return { capturedConfig: () => capturedConfig }
}

// ---------------------------------------------------------------------------
// preAction config propagation
// ---------------------------------------------------------------------------

describe('preAction --config propagation', () => {
  it('propagates root --config to subcommand action opts', async () => {
    const program = makeRootProgram()
    const { capturedConfig } = addProbeCommand(program)

    await program.parseAsync(['node', 'specd', '--config', '/root.yaml', 'probe'])

    expect(capturedConfig()).toBe('/root.yaml')
  })

  it('subcommand --config is also visible after propagation', async () => {
    // Commander lifts a subcommand --config to the root level when the root
    // also declares the same option. The preAction hook then propagates it
    // back to the action command, making it visible on opts.config.
    const program = makeRootProgram()
    const { capturedConfig } = addProbeCommand(program)

    await program.parseAsync(['node', 'specd', 'probe', '--config', '/sub.yaml'])

    expect(capturedConfig()).toBe('/sub.yaml')
  })

  it('last --config value wins when specified in both positions', async () => {
    // Commander last-value-wins semantics: when --config appears twice,
    // the second occurrence is the effective value.
    const program = makeRootProgram()
    const { capturedConfig } = addProbeCommand(program)

    await program.parseAsync([
      'node',
      'specd',
      '--config',
      '/root.yaml',
      'probe',
      '--config',
      '/sub.yaml',
    ])

    expect(capturedConfig()).toBe('/sub.yaml')
  })

  it('subcommand action receives undefined config when no --config given', async () => {
    const program = makeRootProgram()
    const { capturedConfig } = addProbeCommand(program)

    await program.parseAsync(['node', 'specd', 'probe'])

    expect(capturedConfig()).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Banner in root --help, absent from subcommand --help
// ---------------------------------------------------------------------------

describe('banner in --help', () => {
  it('root --help output contains the SpecD banner', async () => {
    const program = makeRootProgram()
    addProbeCommand(program)

    const stdout = captureStdout()
    await program.parseAsync(['node', 'specd', '--help']).catch(() => {
      // exitOverride causes Commander to throw on --help — that is expected
    })

    // The figlet Calvin S font renders "spec" with these box-drawing chars
    expect(stdout()).toMatch(/┌─┐/)
  })

  it('subcommand --help output does not contain the SpecD banner', async () => {
    const program = makeRootProgram()
    addProbeCommand(program)

    const stdout = captureStdout()
    await program.parseAsync(['node', 'specd', 'probe', '--help']).catch(() => {
      // exitOverride causes Commander to throw on --help — that is expected
    })

    // The banner's figlet ASCII art must not appear in subcommand help
    expect(stdout()).not.toMatch(/┌─┐/)
  })
})

// ---------------------------------------------------------------------------
// Auto-dashboard: project dashboard rendered on bare invocation
// ---------------------------------------------------------------------------

describe('auto-dashboard default action', () => {
  function setupDashboard() {
    const config = makeMockConfig()
    const kernel = makeMockKernel()
    vi.mocked(loadConfig).mockResolvedValue(config)
    vi.mocked(createCliKernel).mockResolvedValue(kernel)
    const stdout = captureStdout()
    const stderr = captureStderr()
    mockProcessExit()
    return { config, kernel, stdout, stderr }
  }

  it('renders dashboard when --config is provided with no subcommand', async () => {
    const { stdout } = setupDashboard()

    const program = makeRootProgram()
    // Register the real dashboard command so the default action can dispatch to it
    registerProjectDashboard(program.command('project'))

    // Default action fires: --config provided, no subcommand
    program.action(async () => {
      const configPath = program.opts().config as string | undefined
      const dashboardArgs = ['project', 'dashboard']
      if (configPath !== undefined) {
        dashboardArgs.push('--config', configPath)
        await program.parseAsync(dashboardArgs, { from: 'user' })
      }
    })

    await program.parseAsync(['node', 'specd', '--config', '/project/specd.yaml'])

    // Dashboard rendered — should contain project root from mock config
    expect(stdout()).toContain('/project')
  })

  it('dashboard command name is "dashboard" not "overview"', () => {
    const program = new Command('specd').exitOverride()
    const projectCmd = program.command('project')
    registerProjectDashboard(projectCmd)

    const dashboardCmd = projectCmd.commands.find((c) => c.name() === 'dashboard')
    expect(dashboardCmd).toBeDefined()
    expect(projectCmd.commands.find((c) => c.name() === 'overview')).toBeUndefined()
  })
})
