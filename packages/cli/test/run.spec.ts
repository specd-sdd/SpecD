import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const parseAsync = vi.fn()
const handleErrorSpy = vi.hoisted(() => vi.fn<(err: unknown, format?: string) => never>())

vi.mock('../src/program.js', () => ({
  createProgram: () => ({ parseAsync }),
}))
vi.mock('../src/handle-error.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/handle-error.js')>()
  return {
    ...actual,
    handleError: (...args: Parameters<typeof actual.handleError>) => handleErrorSpy(...args),
  }
})

import { CLI_EXIT_FORCE_MS, CLI_EXIT_HINT_MS, run } from '../src/run.js'
const { handleError: actualHandleError } =
  await vi.importActual<typeof import('../src/handle-error.js')>('../src/handle-error.js')
import { CliExitError } from '../src/helpers/cli-exit-error.js'
import { registerCliCleanup, resetCliCleanupForTests } from '../src/helpers/cli-cleanup.js'

const events: string[] = []

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  events.length = 0
  parseAsync.mockReset()
  handleErrorSpy.mockReset()
  handleErrorSpy.mockImplementation(actualHandleError)
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    events.push(`exit:${code}`)
  }) as never)
  vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string) => {
    events.push(`stderr:${String(chunk).trim()}`)
    return true
  }) as never)
  registerCliCleanup(() => void events.push('cleanup'))
})

afterEach(() => {
  vi.useRealTimers()
  resetCliCleanupForTests()
  vi.restoreAllMocks()
  process.exitCode = undefined
})

describe('run', () => {
  it('awaits cleanup after normal completion and does not call process.exit', async () => {
    parseAsync.mockResolvedValue(undefined)

    await run(['node', 'specd', 'x'])

    expect(parseAsync).toHaveBeenCalledWith(['node', 'specd', 'x'])
    expect(events).toEqual(['cleanup'])
  })

  it('awaits cleanup before exiting with the code of a CliExitError', async () => {
    parseAsync.mockRejectedValue(new CliExitError(1))

    await run(['node', 'specd'])

    expect(events).toEqual(['cleanup', 'exit:1'])
  })

  it('carries exit code 0 from an early successful exit', async () => {
    parseAsync.mockRejectedValue(new CliExitError(0))

    await run(['node', 'specd'])

    expect(events).toEqual(['cleanup', 'exit:0'])
  })

  it('cleans up and exits 3 with a fatal message for an unexpected error', async () => {
    parseAsync.mockRejectedValue(new Error('disk exploded'))

    await run(['node', 'specd'])

    expect(events).toEqual(['stderr:fatal: disk exploded', 'cleanup', 'exit:3'])
  })

  it('still cleans up and exits 3 when the error handler itself fails', async () => {
    parseAsync.mockRejectedValue(new Error('original failure'))
    handleErrorSpy.mockImplementation(() => {
      throw new Error('handler exploded')
    })

    await expect(run(['node', 'specd'])).resolves.toBeUndefined()

    expect(events).toEqual(['cleanup', 'exit:3'])
  })

  it('respects process.exitCode on natural completion without calling process.exit', async () => {
    parseAsync.mockImplementation(async () => {
      process.exitCode = 1
    })

    await run(['node', 'specd'])

    expect(events).toEqual(['cleanup'])
    expect(process.exitCode).toBe(1)
  })
  it('prints nothing and never forces the exit when the process ends by itself', async () => {
    parseAsync.mockResolvedValue(undefined)
    const timers: Array<{ hasRef(): boolean }> = []
    const realSetTimeout = globalThis.setTimeout
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      ...args: Parameters<typeof setTimeout>
    ) => {
      const timer = realSetTimeout(...args) as unknown as { hasRef(): boolean }
      timers.push(timer)
      return timer
    }) as never)

    await run(['node', 'specd'])

    expect(timers).toHaveLength(2)
    expect(timers.every((timer) => !timer.hasRef())).toBe(true)
    // The process ending by itself means the timers never get to fire.
    expect(events).toEqual(['cleanup'])
  })

  it('warns after the hint delay when open handles keep the process alive', async () => {
    parseAsync.mockResolvedValue(undefined)
    await run(['node', 'specd'])

    vi.advanceTimersByTime(CLI_EXIT_HINT_MS)

    expect(events).toHaveLength(2)
    expect(events[1]).toMatch(/^stderr:warning: waiting for open handles to close/)
    expect(events[1]).toContain(
      `forcing exit in ${(CLI_EXIT_FORCE_MS - CLI_EXIT_HINT_MS) / 1000} s`,
    )
    expect(events).not.toContain('exit:0')
  })

  it('lists the distinct open resource types in the hint line', async () => {
    parseAsync.mockResolvedValue(undefined)
    vi.spyOn(process, 'getActiveResourcesInfo').mockReturnValue([
      'Timeout',
      'TCPSocketWrap',
      'Timeout',
    ])
    await run(['node', 'specd'])

    vi.advanceTimersByTime(CLI_EXIT_HINT_MS)

    expect(events[1]).toContain('(Timeout, TCPSocketWrap)')
  })

  it('forces the exit after the force delay with the original exit code', async () => {
    parseAsync.mockImplementation(async () => {
      process.exitCode = 2
    })
    await run(['node', 'specd'])

    vi.advanceTimersByTime(CLI_EXIT_FORCE_MS)

    expect(events.at(-2)).toBe('stderr:warning: process did not exit after cleanup; forcing exit')
    expect(events.at(-1)).toBe('exit:2')
    expect(process.exitCode).toBe(2)
  })

  it('forces the exit with code 0 when no command set an exit code', async () => {
    parseAsync.mockResolvedValue(undefined)
    await run(['node', 'specd'])

    vi.advanceTimersByTime(CLI_EXIT_FORCE_MS)

    expect(events.at(-1)).toBe('exit:0')
  })

  it('does not arm the grace period after an explicit exit', async () => {
    parseAsync.mockRejectedValue(new CliExitError(1))
    await run(['node', 'specd'])

    vi.advanceTimersByTime(CLI_EXIT_FORCE_MS)

    expect(events).toEqual(['cleanup', 'exit:1'])
  })

  it('removes its signal handlers when it finishes', async () => {
    parseAsync.mockResolvedValue(undefined)
    const before = process.listenerCount('SIGINT')

    await run(['node', 'specd'])

    expect(process.listenerCount('SIGINT')).toBe(before)
  })
})

describe('CLI source guards', () => {
  const srcRoot = new URL('../src', import.meta.url).pathname

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

  it('calls process.exit only from run.ts and helpers/cli-signals.ts', async () => {
    const allowed = ['/run.ts', '/helpers/cli-signals.ts']
    const offenders: string[] = []
    for (const file of await walk(srcRoot)) {
      const source = await readFile(file, 'utf8')
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      if (/\bprocess\.exit\(/.test(code) && !allowed.some((suffix) => file.endsWith(suffix))) {
        offenders.push(file.replace(srcRoot, ''))
      }
    }

    expect(offenders).toEqual([])
  })

  it('never throws a CliExitError inside a try whose catch would reclassify it', async () => {
    const offenders: string[] = []
    for (const file of await walk(join(srcRoot, 'commands'))) {
      const source = await readFile(file, 'utf8')
      for (const match of source.matchAll(/\btry\s*\{/g)) {
        let depth = 0
        let index = match.index + match[0].length - 1
        for (; index < source.length; index += 1) {
          if (source[index] === '{') depth += 1
          if (source[index] === '}') {
            depth -= 1
            if (depth === 0) break
          }
        }
        const tryBody = source.slice(match.index, index + 1)
        const rest = source.slice(index + 1)
        const catchMatch = /^\s*catch\s*(\([^)]*\))?\s*\{/.exec(rest)
        if (catchMatch === null || !/throw new CliExitError\(/.test(tryBody)) continue
        let catchDepth = 0
        let end = catchMatch[0].length - 1
        for (; end < rest.length; end += 1) {
          if (rest[end] === '{') catchDepth += 1
          if (rest[end] === '}') {
            catchDepth -= 1
            if (catchDepth === 0) break
          }
        }
        const catchBlock = rest.slice(0, end + 1)
        if (!/handleError|CliExitError/.test(catchBlock)) {
          offenders.push(file.replace(srcRoot, ''))
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('has no command catch block that could swallow a CliExitError', async () => {
    // Blocks that neither report through handleError/cliError, rethrow, nor delegate to a
    // terminal reporter. Each remaining one is best-effort code with no cliError inside.
    const allowedBestEffort: Record<string, number> = {
      '/commands/change/approve.ts': 1,
      '/commands/change/edit.ts': 1,
      '/commands/change/verification.ts': 3,
      '/commands/graph/warn-graph-staleness.ts': 1,
      '/commands/guide/index.ts': 3,
      '/commands/plugins/install.ts': 1,
      '/commands/plugins/uninstall.ts': 1,
      '/commands/plugins/update.ts': 1,
      '/commands/project/init.ts': 1,
      '/commands/schema/extend.ts': 1,
      '/commands/schema/fork.ts': 1,
      '/commands/spec/search.ts': 2,
    }
    const found: Record<string, number> = {}
    for (const file of await walk(join(srcRoot, 'commands'))) {
      const source = await readFile(file, 'utf8')
      for (const match of source.matchAll(/catch\s*(\([^)]*\))?\s*\{/g)) {
        let depth = 0
        let index = match.index + match[0].length - 1
        for (; index < source.length; index += 1) {
          if (source[index] === '{') depth += 1
          if (source[index] === '}') {
            depth -= 1
            if (depth === 0) break
          }
        }
        const block = source.slice(match.index, index + 1)
        if (!/handleError|throw |cliError|CliExitError/.test(block)) {
          const key = file.replace(srcRoot, '')
          found[key] = (found[key] ?? 0) + 1
        }
      }
    }

    expect(found).toEqual(allowedBestEffort)
  })
})
