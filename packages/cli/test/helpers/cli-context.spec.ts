import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeMockConfig, makeMockKernel, makeMockHost } from '../commands/helpers.js'
import { resetCliCleanupForTests, runCliCleanup } from '../../src/helpers/cli-cleanup.js'

vi.mock('@specd/sdk', async () => {
  const actual = await vi.importActual<typeof import('@specd/sdk')>('@specd/sdk')
  return {
    ...actual,
    openSpecdHost: vi.fn(),
  }
})

import { resolveCliContext, buildCliKernelOptions } from '../../src/helpers/cli-context.js'
import { openSpecdHost } from '@specd/sdk'

describe('resolveCliContext', () => {
  afterEach(() => vi.restoreAllMocks())

  it('maps -vv to trace console destination via openSpecdHost options.kernel', async () => {
    const config = makeMockConfig()
    const kernel = makeMockKernel()
    vi.mocked(openSpecdHost).mockResolvedValue(
      makeMockHost({
        config,
        configFilePath: '/project/specd.yaml',
        kernel,
        createGraphProvider: vi.fn(),
      }),
    )

    const previousArgv = process.argv
    process.argv = ['node', 'specd', '-vv']
    try {
      await resolveCliContext()

      expect(openSpecdHost).toHaveBeenCalled()
      const call = vi.mocked(openSpecdHost).mock.calls[0]?.[0]
      expect(call?.startDir).toBeUndefined()
      expect(call?.options?.kernel?.additionalDestinations?.[0]).toMatchObject({
        target: 'console',
        level: 'trace',
      })
    } finally {
      process.argv = previousArgv
    }
  })

  it('leaves plugins enabled when the caller does not disable them', async () => {
    vi.mocked(openSpecdHost).mockResolvedValue(
      makeMockHost({
        config: makeMockConfig(),
        configFilePath: '/project/specd.yaml',
        kernel: makeMockKernel(),
        createGraphProvider: vi.fn(),
      }),
    )
    const onLog = vi.fn()
    vi.mocked(openSpecdHost).mockClear()
    await resolveCliContext({ onLog })
    const call = vi.mocked(openSpecdHost).mock.calls.at(-1)?.[0]
    // Plugins stay enabled: the CLI passes no `plugins` option and the SDK default (on) applies.
    expect(call?.options).toEqual(expect.objectContaining({ kernel: expect.any(Object) }))
    // The spec default is `true`: undefined or an explicit `true` both mean enabled, `false` does not.
    expect([undefined, true]).toContain(call?.options?.plugins)
    expect(call?.options?.plugins).not.toBe(false)
    expect(call?.options?.kernel?.additionalDestinations).toEqual(
      expect.arrayContaining([expect.objectContaining({ target: 'callback', onLog })]),
    )
  })

  it('delivers a log entry from the kernel callback destination to onLog', async () => {
    vi.mocked(openSpecdHost).mockResolvedValue(makeMockHost())
    const onLog = vi.fn()
    vi.mocked(openSpecdHost).mockClear()
    await resolveCliContext({ onLog })
    const destination = vi
      .mocked(openSpecdHost)
      .mock.calls.at(-1)?.[0]
      ?.options?.kernel?.additionalDestinations?.find((entry) => entry.target === 'callback') as
      | { onLog: (entry: unknown) => void }
      | undefined
    const entry = { level: 'info', message: 'hello' }
    destination?.onLog(entry)
    expect(onLog).toHaveBeenCalledWith(entry)
  })

  it('forwards plugins: false to openSpecdHost', async () => {
    vi.mocked(openSpecdHost).mockResolvedValue(
      makeMockHost({
        config: makeMockConfig(),
        configFilePath: '/project/specd.yaml',
        kernel: makeMockKernel(),
        createGraphProvider: vi.fn(),
      }),
    )
    await resolveCliContext({ plugins: false })
    expect(openSpecdHost).toHaveBeenCalledWith(
      expect.objectContaining({ options: expect.objectContaining({ plugins: false }) }),
    )
  })

  it('reads bootstrap warnings from config and returns the CLI context shape', async () => {
    const config = {
      ...makeMockConfig(),
      warnings: ['legacy config warning'],
    }
    const kernel = makeMockKernel()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(openSpecdHost).mockResolvedValue(
      makeMockHost({
        config,
        configFilePath: '/project/specd.yaml',
        kernel,
        createGraphProvider: vi.fn(),
      }),
    )

    const result = await resolveCliContext()

    expect(result).toMatchObject({
      config,
      configFilePath: '/project/specd.yaml',
      kernel,
    })
    expect(typeof result.createGraphProvider).toBe('function')
    expect(typeof result.dispose).toBe('function')
    expect(typeof result[Symbol.asyncDispose]).toBe('function')
    expect(warnSpy).toHaveBeenCalledWith('warning: legacy config warning')
  })

  it('emits each warning once per bootstrap call', async () => {
    const config = {
      ...makeMockConfig(),
      warnings: ['warning one', 'warning two'],
    }
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(openSpecdHost).mockResolvedValue(
      makeMockHost({
        config,
        configFilePath: '/project/specd.yaml',
        kernel: makeMockKernel(),
        createGraphProvider: vi.fn(),
      }),
    )

    await resolveCliContext()

    expect(warnSpy).toHaveBeenCalledTimes(2)
    expect(warnSpy).toHaveBeenNthCalledWith(1, 'warning: warning one')
    expect(warnSpy).toHaveBeenNthCalledWith(2, 'warning: warning two')
  })

  it('does not emit warnings when config.warnings is missing or empty', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    vi.mocked(openSpecdHost).mockResolvedValueOnce(
      makeMockHost({
        config: makeMockConfig(),
        configFilePath: '/project/specd.yaml',
        kernel: makeMockKernel(),
        createGraphProvider: vi.fn(),
      }),
    )
    await resolveCliContext()

    vi.mocked(openSpecdHost).mockResolvedValueOnce(
      makeMockHost({
        config: {
          ...makeMockConfig(),
          warnings: [],
        },
        configFilePath: '/project/specd.yaml',
        kernel: makeMockKernel(),
        createGraphProvider: vi.fn(),
      }),
    )
    await resolveCliContext()

    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('buildCliKernelOptions includes CLI node_modules paths', () => {
    const options = buildCliKernelOptions()
    expect(options.extraNodeModulesPaths?.length).toBeGreaterThan(0)
  })
})

describe('resolveCliContext host cleanup', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    resetCliCleanupForTests()
  })

  it('releases the host through the cleanup registry without the command calling dispose', async () => {
    const host = makeMockHost()
    vi.mocked(openSpecdHost).mockResolvedValue(host)

    await resolveCliContext()
    expect(host.dispose).not.toHaveBeenCalled()
    await runCliCleanup()

    expect(host.dispose).toHaveBeenCalledTimes(1)
  })

  it('reaches the host dispose once per explicit call and once through the registry', async () => {
    // A plain counting mock: it does not memoise, so the counts show what the CLI itself does.
    const dispose = vi.fn(async () => {})
    const host = makeMockHost({ dispose })
    vi.mocked(openSpecdHost).mockResolvedValue(host)

    const context = await resolveCliContext()
    await context.dispose()
    await context.dispose()
    expect(dispose).toHaveBeenCalledTimes(2)

    await runCliCleanup()
    // The registry runs its callback once, however often the cleanup is triggered.
    expect(dispose).toHaveBeenCalledTimes(3)
    await runCliCleanup()
    await runCliCleanup()
    expect(dispose).toHaveBeenCalledTimes(3)
  })

  it('releases a memoising host exactly once however often dispose and cleanup are triggered', async () => {
    let released = 0
    let pending: Promise<void> | undefined
    const dispose = vi.fn(() => {
      pending ??= Promise.resolve().then(() => {
        released += 1
      })
      return pending
    })
    vi.mocked(openSpecdHost).mockResolvedValue(makeMockHost({ dispose }))

    const context = await resolveCliContext()
    await context.dispose()
    await context.dispose()
    await runCliCleanup()
    await runCliCleanup()

    expect(released).toBe(1)
    expect(dispose).toHaveBeenCalledTimes(3)
  })
})

describe('CLI host bootstrap sources', () => {
  it('has no hand-built host and no direct SDK bootstrap outside the helper and the worker', async () => {
    const { readdir, readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const root = new URL('../../src', import.meta.url).pathname

    async function walk(dir: string): Promise<string[]> {
      const entries = await readdir(dir, { withFileTypes: true })
      const nested = await Promise.all(
        entries.map((entry) =>
          entry.isDirectory()
            ? walk(join(dir, entry.name))
            : Promise.resolve([join(dir, entry.name)]),
        ),
      )
      return nested.flat().filter((file) => file.endsWith('.ts'))
    }

    const forbidden: Array<[RegExp, string]> = [
      [/\bopenSpecdHost\b/, 'SDK bootstrap (openSpecdHost)'],
      [/\bcreateSdkContext\b/, 'SDK bootstrap (createSdkContext)'],
      [/\bresolveSdkHostContext\b/, 'removed helper (resolveSdkHostContext)'],
      [/\bcreateGraphProvider\s*[:=(]/, 'hand-built host (createGraphProvider)'],
      [/\bcreateKernel\b/, 'hand-built kernel'],
    ]
    const allowed = ['graph-index-task.ts', 'helpers/cli-host.ts']
    const offenders: string[] = []
    for (const file of await walk(root)) {
      if (file.endsWith('.spec.ts') || file.endsWith('.test.ts')) continue
      if (allowed.some((suffix) => file.endsWith(suffix))) continue
      // Comments may name the forbidden helpers; only code counts.
      const source = (await readFile(file, 'utf8'))
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      for (const [pattern, label] of forbidden) {
        if (pattern.test(source)) offenders.push(`${file}: ${label}`)
      }
    }

    expect(offenders).toEqual([])
    await expect(readFile(join(root, 'helpers/sdk-host.ts'), 'utf8')).rejects.toThrow()
  })
})
