import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { runIsolatedGraphIndex } from '../../../dist/public.js'

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
})
