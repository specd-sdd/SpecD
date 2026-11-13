import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runIsolatedGraphIndex } from '../../../dist/public.js'
import type {
  GraphIndexWorkerDiagnostics,
  GraphIndexWorkerEvent,
} from '../../../src/domain/value-objects/graph-index-worker-types.js'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const fixtureRoot = new URL('../../fixtures/isolated-index-worker/', import.meta.url)

async function settlesWithin<T>(
  operation: Promise<T>,
  description: string,
  timeoutMs = 3_000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${description} did not settle within ${String(timeoutMs)}ms.`)),
          timeoutMs,
        )
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

describe('published isolated graph-index worker', () => {
  let storageRoot: string | undefined

  afterEach(() => {
    if (storageRoot !== undefined) rmSync(storageRoot, { recursive: true, force: true })
    storageRoot = undefined
  })

  async function runBuiltFixture(
    name: string,
    taskInput: Record<string, unknown> = {},
  ): Promise<unknown> {
    storageRoot ??= mkdtempSync(join(tmpdir(), 'specd-isolated-worker-dist-'))
    const result: unknown = await runIsolatedGraphIndex({
      storageRoot,
      taskModule: new URL(name, fixtureRoot),
      taskInput: { ...taskInput, storageRoot },
    })
    return result
  }

  it('ships the worker as a build entry without exposing a public child subpath', () => {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
      exports: Record<string, unknown>
    }
    for (const script of ['build', 'build:dev', 'build:debug', 'dev']) {
      expect(packageJson.scripts[script]).toContain(
        'src/infrastructure/isolated-index-worker/isolated-index-worker-child.ts',
      )
    }
    expect(packageJson.exports).not.toHaveProperty('./isolated-index-worker-child')
    expect(packageJson.exports).not.toHaveProperty('./worker')
    expect(
      existsSync(
        join(
          packageRoot,
          'dist',
          'infrastructure',
          'isolated-index-worker',
          'isolated-index-worker-child.js',
        ),
      ),
    ).toBe(true)

    const childContent = readFileSync(
      join(
        packageRoot,
        'dist',
        'infrastructure',
        'isolated-index-worker',
        'isolated-index-worker-child.js',
      ),
      'utf8',
    )
    const chunkMatch = childContent.match(/from\s+["'](\.\.\/\.\.\/chunk-[^"']+\.js)["']/)
    const chunkContent = chunkMatch
      ? readFileSync(
          join(packageRoot, 'dist', 'infrastructure', 'isolated-index-worker', chunkMatch[1]!),
          'utf8',
        )
      : childContent
    expect(chunkContent).toContain('specd.graph-index.v2')
  })

  it('exposes globalThis.gc to the child task via supervisor runtime options', async () => {
    const result = (await settlesWithin(
      runBuiltFixture('built-gc-observation-task.mjs', { marker: 'gc-test' }),
      'The gc-observation fixture',
    )) as { marker: string; hasGc: boolean; pid: number }

    expect(result.marker).toBe('gc-test')
    expect(result.hasGc).toBe(true)
    expect(result.pid).not.toBe(process.pid)
  })

  it('executes each built task fixture through the published supervisor', async () => {
    const result = await settlesWithin(
      runBuiltFixture('built-valid-task.mjs', { marker: 'published' }),
      'The valid built worker fixture',
    )
    expect(result).toMatchObject({ marker: 'published' })
    expect((result as { readonly pid: number }).pid).not.toBe(process.pid)

    await expect(
      settlesWithin(
        runBuiltFixture('built-invalid-contract-task.mjs'),
        'The invalid-contract fixture',
      ),
    ).rejects.toMatchObject({
      code: 'GRAPH_INDEX_TASK_CONTRACT',
    })
    await expect(
      settlesWithin(runBuiltFixture('built-non-json-task.mjs'), 'The non-JSON fixture'),
    ).rejects.toMatchObject({
      code: 'GRAPH_INDEX_WORKER_PROTOCOL',
    })
    await expect(
      settlesWithin(runBuiltFixture('built-task-failure.mjs'), 'The failing task fixture'),
    ).rejects.toMatchObject({
      code: 'GRAPH_INDEX_TASK_EXECUTION',
      taskCode: 'FIXTURE_FAILURE',
    })
  })

  it('delivers progress and the terminal result when IPC reports backpressure', async () => {
    await expect(
      settlesWithin(runBuiltFixture('built-backpressure-task.mjs'), 'The backpressure fixture'),
    ).resolves.toMatchObject({ delivered: true })
  })

  it('rejects a result followed by an abnormal child exit rather than accepting the result', async () => {
    await expect(
      settlesWithin(
        runBuiltFixture('built-result-then-abnormal-exit-task.mjs'),
        'The abnormal-exit fixture',
      ),
    ).rejects.toMatchObject({
      code: 'GRAPH_INDEX_WORKER_EXIT',
      exitCode: 17,
      signal: null,
    })
  })

  it('settles two forced logical-reindex tasks and releases the supervisor lease', async () => {
    const first = await settlesWithin(
      runBuiltFixture('built-force-recreate-clean-exit-task.mjs', { force: true }),
      'The first forced logical-reindex worker',
    )
    const second = await settlesWithin(
      runBuiltFixture('built-force-recreate-clean-exit-task.mjs', { force: true }),
      'The second forced logical-reindex worker',
    )
    expect(first).toMatchObject({ force: true, state: 'closed' })
    expect(second).toMatchObject({ force: true, state: 'closed' })

    await expect(
      settlesWithin(
        runBuiltFixture('built-valid-task.mjs', { marker: 'lease-released' }),
        'The post-force worker',
      ),
    ).resolves.toMatchObject({ marker: 'lease-released' })
  })

  it('exits cleanly after releasing a full-run native parser workload', async () => {
    await expect(
      settlesWithin(
        runBuiltFixture('built-napi-teardown-task.mjs', { count: 1_200 }),
        'The native-parser teardown fixture',
        10_000,
      ),
    ).resolves.toEqual({ parsed: 1_200 })
  })

  it('reports a silent real child, bounds its captured output, and keeps the host streams clean', async () => {
    // Given a real child that announces a file, stays silent past the threshold, then fails noisily
    storageRoot ??= mkdtempSync(join(tmpdir(), 'specd-isolated-worker-dist-'))
    const hostStderr = vi.spyOn(process.stderr, 'write')
    const hostStdout = vi.spyOn(process.stdout, 'write')
    const events: GraphIndexWorkerEvent[] = []

    // When the run is supervised
    const failure: unknown = await runIsolatedGraphIndex({
      storageRoot,
      taskModule: new URL('built-silent-noisy-failure-task.mjs', fixtureRoot),
      taskInput: { storageRoot },
      onEvent: (event) => events.push(event),
    }).then(
      () => undefined,
      (error: unknown) => error,
    )
    const hostWrites = [...hostStderr.mock.calls, ...hostStdout.mock.calls].map(([chunk]) =>
      String(chunk),
    )
    hostStderr.mockRestore()
    hostStdout.mockRestore()

    // Then the silence was reported, the tails are bounded and decoded, and nothing reached the host
    expect(events).toContainEqual({ kind: 'activity', item: 'src/silent.ts' })
    const silent = events.find((event) => event.kind === 'worker-silent')
    expect(silent).toMatchObject({ kind: 'worker-silent', item: 'src/silent.ts' })
    const diagnostics = (failure as { diagnostics?: GraphIndexWorkerDiagnostics }).diagnostics
    expect(diagnostics?.stderrTail.length).toBeLessThanOrEqual(16 * 1024)
    expect(diagnostics?.stderrTail.endsWith('x')).toBe(true)
    expect(diagnostics?.stdoutTail).toContain('out-marker')
    expect(hostWrites.join('')).not.toContain('out-marker')
    expect(hostWrites.join('')).not.toContain('xxxxxxxx')
  }, 30_000)

  it('decodes invalid UTF-8 in the captured tail with replacement characters', async () => {
    storageRoot ??= mkdtempSync(join(tmpdir(), 'specd-isolated-worker-dist-'))
    const failure: unknown = await runIsolatedGraphIndex({
      storageRoot,
      taskModule: new URL('built-silent-noisy-failure-task.mjs', fixtureRoot),
      taskInput: { storageRoot, silentMs: 0, invalidLast: true },
    }).then(
      () => undefined,
      (error: unknown) => error,
    )
    const diagnostics = (failure as { diagnostics?: GraphIndexWorkerDiagnostics }).diagnostics
    expect(diagnostics?.stderrTail).toContain('\uFFFD')
    expect(diagnostics?.stderrTail.length).toBeLessThanOrEqual(16 * 1024)
  }, 30_000)
})
