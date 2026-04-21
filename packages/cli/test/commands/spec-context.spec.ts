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

import { loadConfig } from '../../src/load-config.js'
import { createCliKernel } from '../../src/kernel.js'
import { registerSpecContext } from '../../src/commands/spec/context.js'

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

describe('spec context', () => {
  it('renders spec header with workspace:path in text mode', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getContext.execute.mockResolvedValue({
      entries: [
        {
          spec: 'default:auth/login',
          title: 'Auth Login',
          description: 'Handles user authentication',
          rules: [{ requirement: 'Must validate email', rules: ['email must contain @'] }],
          constraints: ['Must use HTTPS'],
          scenarios: [
            {
              requirement: 'Must validate email',
              name: 'valid email accepted',
              given: ['user enters valid email'],
              when: ['form is submitted'],
              then: ['login succeeds'],
            },
          ],
          stale: false,
        },
      ],
      warnings: [],
    })

    const program = makeProgram()
    registerSpecContext(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'context', 'auth/login'])

    expect(stdout()).toContain('### Spec: default:auth/login')
  })

  it('includes description and all sections when no flags', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getContext.execute.mockResolvedValue({
      entries: [
        {
          spec: 'default:auth/login',
          description: 'Handles user authentication',
          rules: [{ requirement: 'Must validate email', rules: ['email must contain @'] }],
          constraints: ['Must use HTTPS'],
          scenarios: [
            {
              requirement: 'Must validate email',
              name: 'valid email accepted',
              given: ['user enters valid email'],
              when: ['form is submitted'],
              then: ['login succeeds'],
            },
          ],
          stale: false,
        },
      ],
      warnings: [],
    })

    const program = makeProgram()
    registerSpecContext(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'context', 'auth/login'])

    const out = stdout()
    expect(out).toContain('**Description:** Handles user authentication')
    expect(out).toContain('### Rules')
    expect(out).toContain('### Constraints')
    expect(out).toContain('### Scenarios')
  })

  it('filters to only --rules when flag provided', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getContext.execute.mockResolvedValue({
      entries: [
        {
          spec: 'default:auth/login',
          rules: [{ requirement: 'Must validate email', rules: ['email must contain @'] }],
          stale: false,
        },
      ],
      warnings: [],
    })

    const program = makeProgram()
    registerSpecContext(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'context', 'auth/login', '--rules'])

    const out = stdout()
    expect(out).toContain('### Rules')
    expect(out).not.toContain('### Constraints')
    expect(out).not.toContain('### Scenarios')
    expect(out).not.toContain('**Description:**')
  })

  it('outputs JSON with specs array and warnings', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.getContext.execute.mockResolvedValue({
      entries: [
        {
          spec: 'default:auth/login',
          stale: false,
        },
      ],
      warnings: [],
    })

    const program = makeProgram()
    registerSpecContext(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'context', 'auth/login', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(Array.isArray(parsed.specs)).toBe(true)
    expect(parsed.specs[0].spec).toBe('default:auth/login')
    expect(parsed.specs[0].stale).toBe(false)
    expect(Array.isArray(parsed.warnings)).toBe(true)
  })

  it('exits 1 when spec not found', async () => {
    const { kernel } = setup()
    kernel.specs.getContext.execute.mockResolvedValue({
      entries: [],
      warnings: [
        {
          type: 'missing-spec',
          path: 'missing/spec',
          message: "Spec 'default:missing/spec' not found",
        },
      ],
    })

    const program = makeProgram()
    registerSpecContext(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'context', 'missing/spec']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
  })

  it('exits 1 when --depth is used without --follow-deps', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerSpecContext(program.command('spec'))
    await program
      .parseAsync(['node', 'specd', 'spec', 'context', 'auth/login', '--depth', '2'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('--depth requires --follow-deps')
  })

  it('warns to stderr when use case returns warnings', async () => {
    const { kernel, stderr } = setup()
    kernel.specs.getContext.execute.mockResolvedValue({
      entries: [{ spec: 'default:auth/login', stale: true }],
      warnings: [
        {
          type: 'stale-metadata',
          path: 'default:auth/login',
          message: "Metadata for 'default:auth/login' is stale",
        },
      ],
    })

    const program = makeProgram()
    registerSpecContext(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'context', 'auth/login'])

    expect(stderr()).toContain('warning:')
    expect(stderr()).toContain('stale')
  })
})
