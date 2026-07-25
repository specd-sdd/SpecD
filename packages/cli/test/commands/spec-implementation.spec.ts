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
import { registerSpecImplementation } from '../../src/commands/spec/implementation.js'

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

describe('spec implementation', () => {
  it('list delegates to kernel.specs.getPersistedImplementation', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.getPersistedImplementation.execute).mockResolvedValue({
      specId: 'default:auth/login',
      implementation: [{ file: 'default:src/auth.ts' }],
      initialized: true,
    })

    const program = makeProgram()
    registerSpecImplementation(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'implementation', 'list', 'auth/login'])

    expect(kernel.specs.getPersistedImplementation.execute).toHaveBeenCalledWith({
      specId: 'default:auth/login',
    })
  })

  it('add delegates to kernel.specs.updatePersistedImplementation', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.updatePersistedImplementation.execute).mockResolvedValue({
      specId: 'default:auth/login',
      implementation: [{ file: 'default:src/auth.ts', symbols: ['login'] }],
      created: true,
    })

    const program = makeProgram()
    registerSpecImplementation(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'implementation',
      'add',
      'auth/login',
      '--file',
      'src/auth.ts',
      '--symbol',
      'login',
    ])

    expect(kernel.specs.updatePersistedImplementation.execute).toHaveBeenCalledWith({
      specId: 'default:auth/login',
      action: 'add',
      file: 'src/auth.ts',
      symbols: ['login'],
    })
  })
})
