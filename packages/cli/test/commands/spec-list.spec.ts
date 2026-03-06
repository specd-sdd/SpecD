/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { makeMockConfig, makeMockKernel, makeProgram, captureStdout } from './helpers.js'

vi.mock('../../src/load-config.js', () => ({ loadConfig: vi.fn() }))
vi.mock('../../src/kernel.js', () => ({ createCliKernel: vi.fn() }))

import { loadConfig } from '../../src/load-config.js'
import { createCliKernel } from '../../src/kernel.js'
import { registerSpecList } from '../../src/commands/spec/list.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(loadConfig).mockResolvedValue(config)
  vi.mocked(createCliKernel).mockReturnValue(kernel)
  const stdout = captureStdout()
  return { config, kernel, stdout }
}

afterEach(() => vi.restoreAllMocks())

const entries = [
  { workspace: 'default', path: 'auth/login', title: 'Login', status: 'fresh' as const },
  { workspace: 'default', path: 'auth/register', title: 'Register', status: 'stale' as const },
  { workspace: 'default', path: 'billing/invoices', title: 'Invoices', status: 'missing' as const },
]

describe('spec list --status', () => {
  it('shows STATUS column in text mode', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.list.execute.mockResolvedValue(entries)

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list', '--status'])

    const out = stdout()
    expect(out).toContain('STATUS')
    expect(out).toContain('fresh')
    expect(out).toContain('stale')
    expect(out).toContain('missing')
  })

  it('passes includeStatus true to use case when --status is present', async () => {
    const { kernel } = setup()
    kernel.specs.list.execute.mockResolvedValue([])

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list', '--status'])

    expect(kernel.specs.list.execute).toHaveBeenCalledWith({
      includeSummary: false,
      includeStatus: true,
    })
  })

  it('does not pass includeStatus when --status is absent', async () => {
    const { kernel } = setup()
    kernel.specs.list.execute.mockResolvedValue([])

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list'])

    expect(kernel.specs.list.execute).toHaveBeenCalledWith({
      includeSummary: false,
      includeStatus: false,
    })
  })

  it('filters by single status value', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.list.execute.mockResolvedValue(entries)

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list', '--status', 'stale'])

    const out = stdout()
    expect(out).toContain('Register')
    expect(out).toContain('stale')
    expect(out).not.toContain('Login')
    expect(out).not.toContain('Invoices')
  })

  it('filters by comma-separated status values', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.list.execute.mockResolvedValue(entries)

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list', '--status', 'stale,missing'])

    const out = stdout()
    expect(out).toContain('Register')
    expect(out).toContain('Invoices')
    expect(out).not.toContain('Login')
  })

  it('includes status in JSON output', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.list.execute.mockResolvedValue(entries)

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list', '--status', '--format', 'json'])

    const json = JSON.parse(stdout())
    const specs = json.workspaces[0].specs
    expect(specs[0].status).toBe('fresh')
    expect(specs[1].status).toBe('stale')
    expect(specs[2].status).toBe('missing')
  })

  it('omits status from JSON when --status is not passed', async () => {
    const { kernel, stdout } = setup()
    const noStatusEntries = entries.map(({ status: _, ...rest }) => rest)
    kernel.specs.list.execute.mockResolvedValue(noStatusEntries)

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list', '--format', 'json'])

    const json = JSON.parse(stdout())
    const specs = json.workspaces[0].specs
    expect(specs[0]).not.toHaveProperty('status')
  })

  it('does not show STATUS column when --status is absent', async () => {
    const { kernel, stdout } = setup()
    const noStatusEntries = entries.map(({ status: _, ...rest }) => rest)
    kernel.specs.list.execute.mockResolvedValue(noStatusEntries)

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list'])

    const out = stdout()
    expect(out).not.toContain('STATUS')
  })
})
