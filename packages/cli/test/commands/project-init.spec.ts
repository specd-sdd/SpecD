import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import figlet from 'figlet'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureStderr,
  captureStdout,
  attachKernelPluginSpies,
  expectNoKernelPluginCalls,
  type KernelPluginSpies,
  makeMockConfig,
  makeProgram,
  mockProcessExit,
  makeMockHost,
} from './helpers.js'

const mockInitProject = vi.fn().mockResolvedValue({
  configPath: '/project/specd.yaml',
  schemaRef: '@specd/schema-std',
  workspaces: ['default'],
  metadataCachePath: '.custom/meta-cache',
})

vi.mock('@specd/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@specd/sdk')>()
  return {
    ...original,
    createConfigWriter: vi.fn(() => ({
      initProject: mockInitProject,
      addPlugin: vi.fn(),
      removePlugin: vi.fn(),
    })),
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

vi.mock('../../src/helpers/file-exists.js', () => ({
  fileExists: vi.fn().mockResolvedValue(false),
}))

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  text: vi.fn(async (options: { initialValue?: string }) => options.initialValue ?? ''),
  multiselect: vi.fn(async () => ['@specd/plugin-agent-claude']),
  confirm: vi.fn(async () => true),
  isCancel: vi.fn(() => false),
  outro: vi.fn(),
}))

import { createConfigWriter, createVcsAdapter } from '@specd/sdk'
import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { installPluginsWithKernel } from '../../src/commands/plugins/install.js'
import { fileExists } from '../../src/helpers/file-exists.js'
import { confirm, isCancel, multiselect, outro, text } from '@clack/prompts'
import { registerProjectInit } from '../../src/commands/project/init.js'
import { makeMockKernel } from './helpers.js'

let kernelSpies: KernelPluginSpies

function setup() {
  mockInitProject.mockResolvedValue({
    configPath: '/project/specd.yaml',
    schemaRef: '@specd/schema-std',
    workspaces: ['default'],
    metadataCachePath: '.custom/meta-cache',
  })
  const kernel = makeMockKernel()
  kernelSpies = attachKernelPluginSpies(kernel)
  vi.mocked(resolveCliContext).mockResolvedValue(
    makeMockHost({
      config: makeMockConfig(),
      configFilePath: '/project/specd.yaml',
      kernel,
    }),
  )
  vi.mocked(installPluginsWithKernel).mockResolvedValue({
    plugins: [],
    hasErrors: false,
  })
  const stdout = captureStdout()
  mockProcessExit()
  return { stdout }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('project init', () => {
  it('supports --plugin and installs selected plugins after init', async () => {
    setup()
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

    expect(mockInitProject).toHaveBeenCalledOnce()
    expect(installPluginsWithKernel).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginNames: ['@specd/plugin-agent-claude'],
      }),
    )
    expect(resolveCliContext).toHaveBeenCalledWith(
      expect.objectContaining({ plugins: false, configPath: '/project/specd.yaml' }),
    )
    // Initialisation goes through the config writer, never through the kernel.
    expectNoKernelPluginCalls(kernelSpies)
  })

  it('places specd.yaml at the VCS root when inside a repository', async () => {
    setup()
    vi.mocked(createVcsAdapter).mockResolvedValueOnce({
      rootDir: vi.fn().mockResolvedValue('/repo-root'),
    } as never)
    const program = makeProgram()
    registerProjectInit(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'init', '--workspace', 'default'])
    expect(mockInitProject).toHaveBeenCalledWith(
      expect.objectContaining({ projectRoot: '/repo-root' }),
    )
  })

  it('falls back to the current directory outside a repository', async () => {
    setup()
    vi.mocked(createVcsAdapter).mockRejectedValueOnce(new Error('not a repository'))
    const program = makeProgram()
    registerProjectInit(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'init', '--workspace', 'default'])
    expect(mockInitProject).toHaveBeenCalledWith(
      expect.objectContaining({ projectRoot: process.cwd() }),
    )
  })

  it('supports --plugin with @specd/plugin-agent-opencode', async () => {
    setup()
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
      '@specd/plugin-agent-opencode',
    ])

    expect(mockInitProject).toHaveBeenCalledOnce()
    expect(installPluginsWithKernel).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginNames: ['@specd/plugin-agent-opencode'],
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

  it('rejects an unscoped plugin name before writing the config', async () => {
    setup()
    const stderr = captureStderr()
    const program = makeProgram()
    registerProjectInit(program.command('project'))
    await expect(
      program.parseAsync(['node', 'specd', 'project', 'init', '--plugin', 'my-plugin']),
    ).rejects.toMatchObject({ code: 1 })
    expect(process.exit).toHaveBeenCalledWith(1)
    expect(mockInitProject).not.toHaveBeenCalled()
    expectNoKernelPluginCalls(kernelSpies)
    expect(stderr()).toContain('scoped package name')
  })

  it('exits 1 and reports the failure when a plugin install fails after init', async () => {
    const { stdout } = setup()
    vi.mocked(installPluginsWithKernel).mockResolvedValue({
      plugins: [{ name: '@specd/plugin-agent-claude', status: 'error', detail: 'boom' }],
      hasErrors: true,
    })
    const program = makeProgram()
    registerProjectInit(program.command('project'))
    await expect(
      program.parseAsync([
        'node',
        'specd',
        'project',
        'init',
        '--plugin',
        '@specd/plugin-agent-claude',
      ]),
    ).rejects.toMatchObject({ code: 1 })
    expect(mockInitProject).toHaveBeenCalledOnce()
    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stdout()).toContain('plugins: error @specd/plugin-agent-claude (boom)')
  })

  it('reports the failure in JSON output when a plugin install fails after init', async () => {
    const { stdout } = setup()
    vi.mocked(installPluginsWithKernel).mockResolvedValue({
      plugins: [{ name: '@specd/plugin-agent-claude', status: 'error', detail: 'boom' }],
      hasErrors: true,
    })
    const program = makeProgram()
    registerProjectInit(program.command('project'))
    await expect(
      program.parseAsync([
        'node',
        'specd',
        'project',
        'init',
        '--plugin',
        '@specd/plugin-agent-claude',
        '--format',
        'json',
      ]),
    ).rejects.toMatchObject({ code: 1 })
    expect(JSON.parse(stdout()).plugins).toEqual([
      { name: '@specd/plugin-agent-claude', status: 'error', detail: 'boom' },
    ])
  })

  it('stays non-interactive when a default flag is passed explicitly', async () => {
    const { stdout } = setup()
    const tty = process.stdout.isTTY
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    try {
      const program = makeProgram()
      registerProjectInit(program.command('project'))
      await program.parseAsync(['node', 'specd', 'project', 'init', '--workspace', 'default'])
      expect(mockInitProject).toHaveBeenCalledOnce()
      expect(stdout()).toContain('initialized specd in')
      expect(stdout()).not.toContain('sdk   v')
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: tty, configurable: true })
    }
  })

  it('runs the wizard, shows the banner, and installs the multiselect choice', async () => {
    const { stdout } = setup()
    const tty = process.stdout.isTTY
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    try {
      const program = makeProgram()
      registerProjectInit(program.command('project'))
      await program.parseAsync(['node', 'specd', 'project', 'init'])
      expect(multiselect).toHaveBeenCalled()
      expect(mockInitProject).toHaveBeenCalledOnce()
      expect(installPluginsWithKernel).toHaveBeenCalledWith(
        expect.objectContaining({ pluginNames: ['@specd/plugin-agent-claude'] }),
      )
      const plain = stdout().replace(/\u001b\[[0-9;]*m/g, '')
      const artLines = figlet.textSync('specd', { font: 'Calvin S' }).split('\n')
      for (const line of artLines.filter((l) => l.trim().length > 0)) {
        expect(plain).toContain(line.trimEnd())
      }
      expect(plain).toContain('sdk   v')
      expect(stdout()).toContain('metadata cache:')
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: tty, configurable: true })
    }
  })

  it('cancels the wizard without writing and asks before overwrite', async () => {
    setup()
    vi.mocked(isCancel).mockReturnValueOnce(true)
    const tty = process.stdout.isTTY
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    try {
      const program = makeProgram()
      registerProjectInit(program.command('project'))
      await program.parseAsync(['node', 'specd', 'project', 'init']).catch(() => {})
      expect(mockInitProject).not.toHaveBeenCalled()
      expect(outro).toHaveBeenCalled()

      vi.mocked(isCancel).mockReturnValue(false)
      vi.mocked(fileExists).mockResolvedValueOnce(true)
      vi.mocked(confirm).mockResolvedValueOnce(false as never)
      const again = makeProgram()
      registerProjectInit(again.command('project'))
      await again.parseAsync(['node', 'specd', 'project', 'init']).catch(() => {})
      expect(confirm).toHaveBeenCalled()
      expect(mockInitProject).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: tty, configurable: true })
      vi.mocked(isCancel).mockReturnValue(false)
    }
  })

  it('exits 0 and writes nothing when a wizard prompt is cancelled', async () => {
    setup()
    vi.mocked(isCancel).mockReturnValueOnce(true)
    const tty = process.stdout.isTTY
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    try {
      const program = makeProgram()
      registerProjectInit(program.command('project'))
      await program.parseAsync(['node', 'specd', 'project', 'init']).catch(() => {})
      expect(outro).toHaveBeenCalledWith('Cancelled.')
      expect(process.exit).toHaveBeenCalledWith(0)
      expect(mockInitProject).not.toHaveBeenCalled()
      expect(installPluginsWithKernel).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: tty, configurable: true })
    }
  })

  it('offers exactly the five known plugins and accepts an empty selection', async () => {
    setup()
    vi.mocked(multiselect).mockImplementationOnce(async () => [])
    const tty = process.stdout.isTTY
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    try {
      const program = makeProgram()
      registerProjectInit(program.command('project'))
      await program.parseAsync(['node', 'specd', 'project', 'init'])
      const options = vi.mocked(multiselect).mock.calls[0]?.[0] as {
        options: { value: string }[]
        required?: boolean
      }
      expect(options.options.map((option) => option.value)).toEqual([
        '@specd/plugin-agent-claude',
        '@specd/plugin-agent-copilot',
        '@specd/plugin-agent-codex',
        '@specd/plugin-agent-opencode',
        '@specd/plugin-agent-standard',
      ])
      expect(options.required).toBe(false)
      expect(mockInitProject).toHaveBeenCalledOnce()
      expect(installPluginsWithKernel).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: tty, configurable: true })
    }
  })

  it('cancelling the wizard exits 0 and the overwrite prompt names what is overwritten', async () => {
    setup()
    const tty = process.stdout.isTTY
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    try {
      vi.mocked(fileExists).mockResolvedValueOnce(true)
      vi.mocked(confirm).mockResolvedValueOnce(false as never)
      const program = makeProgram()
      registerProjectInit(program.command('project'))
      await program.parseAsync(['node', 'specd', 'project', 'init']).catch(() => {})
      const message = (vi.mocked(confirm).mock.calls[0]?.[0] as { message: string }).message
      expect(message).toContain('/project/specd.yaml')
      expect(message).toContain('Overwrit')
      expect(message).toContain('declared plugins')
      expect(message).toContain('workspaces')
      expect(process.exit).toHaveBeenCalledWith(0)
      expect(mockInitProject).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: tty, configurable: true })
    }
  })

  it('documents the cancel exit code in the help', () => {
    const stdout = captureStdout()
    mockProcessExit()
    const program = makeProgram()
    const project = program.command('project')
    registerProjectInit(project)
    project.commands.find((command) => command.name() === 'init')?.outputHelp({ error: false })
    expect(stdout()).toContain('exits with code 0')
  })

  it('asks overwrite before schema and plugin wizard prompts when specd.yaml exists', async () => {
    setup()
    const tty = process.stdout.isTTY
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    const order: string[] = []
    vi.mocked(fileExists).mockResolvedValueOnce(true)
    vi.mocked(confirm).mockImplementation(async () => {
      order.push('overwrite')
      return true as never
    })
    vi.mocked(text).mockImplementation(
      async (options: { message?: string; initialValue?: string }) => {
        order.push(String(options.message))
        return options.initialValue ?? ''
      },
    )
    vi.mocked(multiselect).mockImplementation(async () => {
      order.push('plugins')
      return []
    })
    try {
      const program = makeProgram()
      registerProjectInit(program.command('project'))
      await program.parseAsync(['node', 'specd', 'project', 'init'])
      expect(order[0]).toBe('overwrite')
      expect(order.indexOf('Schema reference')).toBeGreaterThan(0)
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: tty, configurable: true })
    }
  })

  it('does not print the banner in non-interactive text output', async () => {
    const { stdout } = setup()
    const program = makeProgram()
    registerProjectInit(program.command('project'))
    await program.parseAsync([
      'node',
      'specd',
      'project',
      'init',
      '--workspace',
      'default',
      '--format',
      'text',
    ])
    expect(stdout()).toContain('initialized specd in')
    expect(stdout()).not.toContain('sdk   v')
  })

  describe('specd init (top-level alias)', () => {
    it('exits 0 and calls createConfigWriter().initProject with specd init', async () => {
      setup()
      const program = makeProgram()
      registerProjectInit(program)

      await program.parseAsync([
        'node',
        'specd',
        'init',
        '--workspace',
        'default',
        '--workspace-path',
        'specs/',
      ])

      expect(createConfigWriter).toHaveBeenCalled()
      expect(mockInitProject).toHaveBeenCalledOnce()
      expect(mockInitProject).toHaveBeenCalledWith(
        expect.objectContaining({
          schemaRef: '@specd/schema-std',
          workspaceId: 'default',
          specsPath: 'specs/',
        }),
      )
    })

    it('produces valid JSON output with specd init --format json', async () => {
      const { stdout } = setup()

      const program = makeProgram()
      registerProjectInit(program)
      await program.parseAsync([
        'node',
        'specd',
        'init',
        '--workspace',
        'default',
        '--workspace-path',
        'specs/',
        '--format',
        'json',
      ])

      const parsed = JSON.parse(stdout())
      expect(parsed.result).toBe('ok')
      expect(parsed.configPath).toBe('/project/specd.yaml')
      expect(parsed.schema).toBe('@specd/schema-std')
      expect(parsed.workspaces).toEqual(['default'])
      expect(parsed.metadataCachePath).toBe('.custom/meta-cache')
    })

    it('prints metadata cache line in text output', async () => {
      const { stdout } = setup()

      const program = makeProgram()
      registerProjectInit(program)
      await program.parseAsync([
        'node',
        'specd',
        'init',
        '--workspace',
        'default',
        '--workspace-path',
        'specs/',
      ])

      expect(stdout()).toContain('metadata cache: .custom/meta-cache (ignored in .gitignore)')
    })

    it('exits 1 with an error message and leaves the existing specd.yaml unchanged', async () => {
      setup()
      const stderr = captureStderr()
      const dir = await mkdtemp(join(tmpdir(), 'specd-init-existing-'))
      const configPath = join(dir, 'specd.yaml')
      const original = 'schema: "@specd/schema-std"\n# keep me\n'
      await writeFile(configPath, original, 'utf8')
      vi.mocked(createVcsAdapter).mockResolvedValueOnce({
        rootDir: vi.fn().mockResolvedValue(dir),
      } as never)
      // Delegate to the real writer so the refusal and the untouched file are genuine.
      const actual = await vi.importActual<typeof import('@specd/sdk')>('@specd/sdk')
      mockInitProject.mockImplementationOnce(
        (input: Parameters<ReturnType<typeof actual.createConfigWriter>['initProject']>[0]) =>
          actual.createConfigWriter().initProject(input),
      )

      const program = makeProgram()
      registerProjectInit(program)

      await expect(
        program.parseAsync([
          'node',
          'specd',
          'init',
          '--workspace',
          'default',
          '--workspace-path',
          'specs/',
        ]),
      ).rejects.toMatchObject({ code: 1 })
      expect(mockInitProject).toHaveBeenCalledOnce()
      expect(stderr()).toMatch(/error:.*already initialised/i)
      expect(process.exit).toHaveBeenCalledWith(1)
      expect(await readFile(configPath, 'utf8')).toBe(original)
    })

    it('delegates to the real writer: dirs, gitignore entries, tmp gitignore and configVersion 2', async () => {
      setup()
      const dir = await mkdtemp(join(tmpdir(), 'specd-init-real-'))
      execFileSync('git', ['init', '-q', dir])
      vi.mocked(createVcsAdapter).mockResolvedValueOnce({
        rootDir: vi.fn().mockResolvedValue(dir),
      } as never)
      const actual = await vi.importActual<typeof import('@specd/sdk')>('@specd/sdk')
      mockInitProject.mockImplementationOnce(
        (input: Parameters<ReturnType<typeof actual.createConfigWriter>['initProject']>[0]) =>
          actual.createConfigWriter().initProject(input),
      )

      const program = makeProgram()
      registerProjectInit(program)
      await program.parseAsync([
        'node',
        'specd',
        'init',
        '--workspace',
        'default',
        '--workspace-path',
        'specs/',
      ])

      const config = await readFile(join(dir, 'specd.yaml'), 'utf8')
      expect(config).toMatch(/configVersion:\s*2/)
      const gitignore = await readFile(join(dir, '.gitignore'), 'utf8')
      expect(gitignore).toContain('specd.local.yaml')
      expect(gitignore).toContain('specd.local.*.yaml')
      expect(gitignore).toContain('/.specd/metadata/')
      expect((await stat(join(dir, 'specs'))).isDirectory()).toBe(true)
      expect((await stat(join(dir, '.specd'))).isDirectory()).toBe(true)
      const tmpIgnore = (
        await readFile(join(dir, '.specd', 'config', 'tmp', '.gitignore'), 'utf8')
      ).split('\n')
      expect(tmpIgnore[0]).toBe('*')
      expect(tmpIgnore[1]).toBe('!.gitignore')
      for (const sub of ['changes', 'drafts', 'discarded', 'archive', 'metadata']) {
        expect((await stat(join(dir, '.specd', sub))).isDirectory()).toBe(true)
      }
    })

    it('re-runs over an existing config through the real writer with --force', async () => {
      setup()
      const dir = await mkdtemp(join(tmpdir(), 'specd-init-force-'))
      execFileSync('git', ['init', '-q', dir])
      await writeFile(join(dir, 'specd.yaml'), 'schema: "@specd/schema-std"\n# old\n', 'utf8')
      vi.mocked(createVcsAdapter).mockResolvedValueOnce({
        rootDir: vi.fn().mockResolvedValue(dir),
      } as never)
      const actual = await vi.importActual<typeof import('@specd/sdk')>('@specd/sdk')
      mockInitProject.mockImplementationOnce(
        (input: Parameters<ReturnType<typeof actual.createConfigWriter>['initProject']>[0]) =>
          actual.createConfigWriter().initProject(input),
      )

      const program = makeProgram()
      registerProjectInit(program)
      await program.parseAsync([
        'node',
        'specd',
        'init',
        '--workspace',
        'default',
        '--workspace-path',
        'specs/',
        '--force',
      ])

      const config = await readFile(join(dir, 'specd.yaml'), 'utf8')
      expect(config).not.toContain('# old')
      expect(config).toMatch(/configVersion:\s*2/)
      expect((await stat(join(dir, '.specd', 'changes'))).isDirectory()).toBe(true)
      const tmpIgnore = (
        await readFile(join(dir, '.specd', 'config', 'tmp', '.gitignore'), 'utf8')
      ).split('\n')
      expect(tmpIgnore[0]).toBe('*')
      expect(tmpIgnore[1]).toBe('!.gitignore')
      const rootIgnore = await readFile(join(dir, '.gitignore'), 'utf8')
      expect(rootIgnore.split('\n').filter((l) => l.trim() === '/.specd/metadata/')).toHaveLength(1)
    })

    it('overwrites config with specd init --force', async () => {
      setup()

      const program = makeProgram()
      registerProjectInit(program)
      await program.parseAsync([
        'node',
        'specd',
        'init',
        '--workspace',
        'default',
        '--workspace-path',
        'specs/',
        '--force',
      ])

      expect(mockInitProject).toHaveBeenCalledWith(expect.objectContaining({ force: true }))
    })

    /**
     * Runs one registration of `init` and records everything observable about it.
     *
     * @param register - Registers the command on a fresh program
     * @param argv - Command words, including the leading `init` path
     * @returns Writer input, stdout, exit codes and prompt calls of the run
     */
    async function runInit(
      register: (program: ReturnType<typeof makeProgram>) => void,
      argv: string[],
    ) {
      vi.clearAllMocks()
      const { stdout } = setup()
      const program = makeProgram()
      register(program)
      let thrown: unknown
      await program.parseAsync(['node', 'specd', ...argv]).catch((error: unknown) => {
        thrown = error
      })
      return {
        initInput: mockInitProject.mock.calls.map((call) => call[0] as unknown),
        stdout: stdout(),
        exitCodes: vi.mocked(process.exit).mock.calls.map((call) => call[0]),
        thrownCode: (thrown as { code?: unknown } | undefined)?.code,
        installs: vi.mocked(installPluginsWithKernel).mock.calls.map((call) => call[0].pluginNames),
        prompts: {
          text: vi.mocked(text).mock.calls.map((call) => call[0].message),
          multiselect: vi.mocked(multiselect).mock.calls.map((call) => call[0].message),
          confirm: vi.mocked(confirm).mock.calls.length,
        },
      }
    }

    const viaProject = (program: ReturnType<typeof makeProgram>) =>
      registerProjectInit(program.command('project'))
    const viaAlias = (program: ReturnType<typeof makeProgram>) => registerProjectInit(program)

    it.each([
      ['flags', ['--workspace', 'default', '--workspace-path', 'specs/', '--force']],
      ['plugin flag', ['--workspace', 'default', '--plugin', '@specd/plugin-agent-claude']],
      ['json format', ['--workspace', 'default', '--format', 'json']],
      ['invalid plugin', ['--plugin', 'my-plugin']],
    ])('behaves exactly like project init for %s', async (_label, flags) => {
      const viaProjectRun = await runInit(viaProject, ['project', 'init', ...flags])
      const viaAliasRun = await runInit(viaAlias, ['init', ...flags])
      expect(viaAliasRun).toEqual(viaProjectRun)
      // The comparison is not vacuous: something observable happened on each path.
      expect(viaProjectRun.initInput.length + viaProjectRun.exitCodes.length).toBeGreaterThan(0)
    })

    it('runs the same wizard prompts and exit code as project init', async () => {
      const tty = process.stdout.isTTY
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
      try {
        const viaProjectRun = await runInit(viaProject, ['project', 'init'])
        const viaAliasRun = await runInit(viaAlias, ['init'])
        expect(viaProjectRun.prompts.multiselect).toHaveLength(1)
        expect(viaAliasRun).toEqual(viaProjectRun)

        vi.mocked(isCancel).mockReturnValue(true)
        const cancelledProject = await runInit(viaProject, ['project', 'init'])
        vi.mocked(isCancel).mockReturnValue(true)
        const cancelledAlias = await runInit(viaAlias, ['init'])
        expect(cancelledProject.exitCodes).toEqual([0])
        expect(cancelledAlias).toEqual(cancelledProject)
      } finally {
        vi.mocked(isCancel).mockReturnValue(false)
        Object.defineProperty(process.stdout, 'isTTY', { value: tty, configurable: true })
      }
    })

    it('rejects excess positional arguments', async () => {
      const program = makeProgram()
      registerProjectInit(program)

      await expect(program.parseAsync(['node', 'specd', 'init', 'extra-arg'])).rejects.toThrow(
        /too many arguments/i,
      )
    })
  })
})
