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
import { registerSpecDeps } from '../../src/commands/spec/deps.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({
    config,
    configFilePath: null,
    kernel,
  })
  captureStdout()
  mockProcessExit()
  return { kernel }
}

afterEach(() => vi.restoreAllMocks())

describe('spec deps', () => {
  it('list delegates to kernel.specs.getPersistedDeps', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.getPersistedDeps.execute).mockResolvedValue({
      specId: 'default:auth/login',
      dependsOn: ['default:auth/shared'],
      initialized: true,
    })

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'deps', 'list', 'auth/login'])

    expect(kernel.specs.getPersistedDeps.execute).toHaveBeenCalledWith({
      specId: 'default:auth/login',
    })
  })

  it('set delegates to kernel.specs.updatePersistedDeps', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.updatePersistedDeps.execute).mockResolvedValue({
      specId: 'default:auth/login',
      dependsOn: ['default:auth/shared'],
      created: false,
    })

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'deps',
      'set',
      'auth/login',
      '--dep',
      'default:auth/shared',
    ])

    expect(kernel.specs.updatePersistedDeps.execute).toHaveBeenCalledWith({
      specId: 'default:auth/login',
      set: ['default:auth/shared'],
    })
  })
})
