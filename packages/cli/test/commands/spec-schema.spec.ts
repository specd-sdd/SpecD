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
import { registerSpecSchema } from '../../src/commands/spec/schema.js'

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

describe('spec schema', () => {
  it('get delegates to kernel.specs.getPersistedSchema', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.getPersistedSchema.execute).mockResolvedValue({
      specId: 'default:auth/login',
      schema: { name: 'specd-std', version: 1 },
    })

    const program = makeProgram()
    registerSpecSchema(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'schema', 'get', 'auth/login'])

    expect(kernel.specs.getPersistedSchema.execute).toHaveBeenCalledWith({
      specId: 'default:auth/login',
    })
  })

  it('set delegates to kernel.specs.updatePersistedSchema', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.updatePersistedSchema.execute).mockResolvedValue({
      specId: 'default:auth/login',
      schema: { name: 'specd-std', version: 1 },
      changed: true,
      dependsOn: [],
    })

    const program = makeProgram()
    registerSpecSchema(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'schema',
      'set',
      'auth/login',
      '--schema',
      '@specd/schema-std',
    ])

    expect(kernel.specs.updatePersistedSchema.execute).toHaveBeenCalledWith({
      specId: 'default:auth/login',
      schemaRef: '@specd/schema-std',
    })
  })
})
