import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureStdout,
  makeMockConfig,
  makeMockKernel,
  makeMockUseCase,
  makeProgram,
  mockProcessExit,
} from './helpers.js'

vi.mock('@specd/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@specd/core')>()
  return {
    ...original,
    createInitProject: vi.fn(),
    createVcsAdapter: vi.fn().mockResolvedValue({
      rootDir: vi.fn().mockResolvedValue('/project'),
      branch: vi.fn().mockResolvedValue('main'),
      isClean: vi.fn().mockResolvedValue(true),
      ref: vi.fn().mockResolvedValue('abc1234'),
      show: vi.fn().mockResolvedValue(null),
    }),
  }
})

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

vi.mock('../../src/commands/plugins/install.js', () => ({
  installPluginsWithKernel: vi.fn(),
}))

import { createInitProject } from '@specd/core'
import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { installPluginsWithKernel } from '../../src/commands/plugins/install.js'
import { registerProjectInit } from '../../src/commands/project/init.js'

function setup() {
  const initExecute = vi.fn().mockResolvedValue({
    configPath: '/project/specd.yaml',
    schemaRef: '@specd/schema-std',
    workspaces: ['default'],
  })
  vi.mocked(createInitProject).mockReturnValue(
    makeMockUseCase<ReturnType<typeof createInitProject>>(initExecute),
  )
  vi.mocked(resolveCliContext).mockResolvedValue({
    config: makeMockConfig(),
    configFilePath: '/project/specd.yaml',
    kernel: makeMockKernel(),
  })
  vi.mocked(installPluginsWithKernel).mockResolvedValue({
    plugins: [],
    hasErrors: false,
  })
  const stdout = captureStdout()
  mockProcessExit()
  return { initExecute, stdout }
}

afterEach(() => vi.restoreAllMocks())

describe('project init', () => {
  it('supports --plugin and installs selected plugins after init', async () => {
    const { initExecute } = setup()
    const program = makeProgram()
    registerProjectInit(program.command('project'))

    await program.parseAsync([
      'node',
      'specd',
      'project',
      'init',
      '--workspace',
      'default',
      '--workspace-path',
      'specs/',
      '--plugin',
      '@specd/plugin-agent-claude',
    ])

    expect(initExecute).toHaveBeenCalledOnce()
    expect(installPluginsWithKernel).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginNames: ['@specd/plugin-agent-claude'],
      }),
    )
  })

  it('outputs JSON with plugin results', async () => {
    const { stdout } = setup()
    vi.mocked(installPluginsWithKernel).mockResolvedValue({
      plugins: [{ name: '@specd/plugin-agent-claude', status: 'installed', detail: 'ok' }],
      hasErrors: false,
    })

    const program = makeProgram()
    registerProjectInit(program.command('project'))
    await program.parseAsync([
      'node',
      'specd',
      'project',
      'init',
      '--workspace',
      'default',
      '--workspace-path',
      'specs/',
      '--plugin',
      '@specd/plugin-agent-claude',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(parsed.plugins).toEqual([
      { name: '@specd/plugin-agent-claude', status: 'installed', detail: 'ok' },
    ])
  })
})
