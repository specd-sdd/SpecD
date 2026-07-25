import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
  buildCliKernelOptions: vi.fn(() => ({})),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerSpecInit } from '../../src/commands/spec/init.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({
    config,
    configFilePath: null,
    kernel,
  })
  const stdout = captureStdout()
  mockProcessExit()
  return { kernel, stdout }
}

afterEach(() => vi.restoreAllMocks())

describe('spec init', () => {
  it('requires either specPath or --all', async () => {
    setup()
    const program = makeProgram()
    registerSpecInit(program.command('spec'))
    await expect(program.parseAsync(['node', 'specd', 'spec', 'init'])).rejects.toThrow()
  })

  it('delegates single-spec init to kernel', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(kernel.specs.initializePersistedState.execute).mockResolvedValue({
      kind: 'spec',
      initialized: {
        specId: 'default:auth/login',
        schema: { name: 'specd-std', version: 1 },
        dependsOn: [],
      },
    })

    const program = makeProgram()
    registerSpecInit(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'init', 'auth/login'])

    expect(kernel.specs.initializePersistedState.execute).toHaveBeenCalledWith({
      target: { kind: 'spec', specId: 'default:auth/login' },
    })
    expect(stdout()).toContain('initialized default:auth/login')
  })
})
