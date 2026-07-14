import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { type SpecdConfig } from '../../../src/application/specd-config.js'
import { createKernel } from '../../../src/composition/kernel.js'
import { createGetChangeArtifact } from '../../../src/composition/use-cases/get-change-artifact.js'
import { createGetReadOnlyChangeArtifact } from '../../../src/composition/use-cases/get-read-only-change-artifact.js'
import { createOutlineChangeArtifact } from '../../../src/composition/use-cases/outline-change-artifact.js'
import { createReadLog } from '../../../src/composition/use-cases/read-log.js'
import { createSaveChangeArtifact } from '../../../src/composition/use-cases/save-change-artifact.js'
import { createValidateChangeBatch } from '../../../src/composition/use-cases/validate-change-batch.js'
import { LogRingBuffer } from '../../../src/infrastructure/logging/log-ring-buffer.js'
import { type LogEntry } from '../../../src/application/ports/logger.port.js'
import { testActor } from '../../application/use-cases/helpers.js'

let tmpDir: string | undefined

afterEach(async () => {
  if (tmpDir !== undefined) {
    await fs.rm(tmpDir, { recursive: true, force: true })
    tmpDir = undefined
  }
})

async function makeConfig(): Promise<SpecdConfig> {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-branch-factories-'))
  const specsPath = path.join(tmpDir, 'specs')
  const changesPath = path.join(tmpDir, '.specd', 'changes')
  const draftsPath = path.join(tmpDir, '.specd', 'drafts')
  const discardedPath = path.join(tmpDir, '.specd', 'discarded')
  const archivePath = path.join(tmpDir, '.specd', 'archive')

  await Promise.all([
    fs.mkdir(specsPath, { recursive: true }),
    fs.mkdir(changesPath, { recursive: true }),
    fs.mkdir(draftsPath, { recursive: true }),
    fs.mkdir(discardedPath, { recursive: true }),
    fs.mkdir(archivePath, { recursive: true }),
  ])

  return {
    projectRoot: tmpDir,
    configPath: path.join(tmpDir, 'specd.yaml'),
    schemaRef: '@specd/schema-std',
    workspaces: [
      {
        name: 'default',
        specsPath,
        specsAdapter: { adapter: 'fs', config: { path: specsPath } },
        schemasPath: null,
        schemasAdapter: null,
        codeRoot: tmpDir,
        ownership: 'owned',
        isExternal: false,
      },
    ],
    storage: {
      changesPath,
      changesAdapter: { adapter: 'fs', config: { path: changesPath } },
      draftsPath,
      draftsAdapter: { adapter: 'fs', config: { path: draftsPath } },
      discardedPath,
      discardedAdapter: { adapter: 'fs', config: { path: discardedPath } },
      archivePath,
      archiveAdapter: { adapter: 'fs', config: { path: archivePath } },
    },
    approvals: { spec: false, signoff: false },
  }
}

async function captureFailure(run: () => Promise<unknown>): Promise<Error> {
  try {
    await run()
  } catch (error) {
    return error as Error
  }

  throw new Error('Expected operation to fail')
}

function expectSameFailure(actual: Error, expected: Error): void {
  expect(actual.constructor).toBe(expected.constructor)
  expect(actual.message).toBe(expected.message)
}

function entry(message: string, level: LogEntry['level'] = 'info'): LogEntry {
  return {
    timestamp: new Date('2026-07-14T09:00:00.000Z'),
    level,
    message,
    context: { source: 'retained-branch-factories' },
  }
}

describe('retained branch factory parity', () => {
  it('matches kernel behaviour for config-backed retained change factories', async () => {
    const config = await makeConfig()
    const logRing = new LogRingBuffer(8)
    const kernel = await createKernel(config, { logRing })

    const standaloneGetArtifact = createGetChangeArtifact(config)
    const standaloneGetReadOnlyArtifact = createGetReadOnlyChangeArtifact(config)
    const standaloneSaveArtifact = createSaveChangeArtifact(config)
    const standaloneOutlineArtifact = createOutlineChangeArtifact(config)
    const standaloneValidateBatch = createValidateChangeBatch(config)

    const getArtifactError = await captureFailure(() =>
      standaloneGetArtifact.execute({ name: 'missing', filename: 'proposal.md' }),
    )
    const kernelGetArtifactError = await captureFailure(() =>
      kernel.changes.getArtifact.execute({ name: 'missing', filename: 'proposal.md' }),
    )
    expectSameFailure(getArtifactError, kernelGetArtifactError)

    const getReadOnlyError = await captureFailure(() =>
      standaloneGetReadOnlyArtifact.execute({
        readOnlyOrigin: 'draft',
        name: 'missing',
        filename: 'proposal.md',
      }),
    )
    const kernelGetReadOnlyError = await captureFailure(() =>
      kernel.changes.getReadOnlyChangeArtifact.execute({
        readOnlyOrigin: 'draft',
        name: 'missing',
        filename: 'proposal.md',
      }),
    )
    expectSameFailure(getReadOnlyError, kernelGetReadOnlyError)

    const saveArtifactError = await captureFailure(() =>
      standaloneSaveArtifact.execute({
        name: 'missing',
        filename: 'proposal.md',
        content: '# proposal',
        originalHash: 'sha256:0',
        actor: testActor,
      }),
    )
    const kernelSaveArtifactError = await captureFailure(() =>
      kernel.changes.saveArtifact.execute({
        name: 'missing',
        filename: 'proposal.md',
        content: '# proposal',
        originalHash: 'sha256:0',
        actor: testActor,
      }),
    )
    expectSameFailure(saveArtifactError, kernelSaveArtifactError)

    const outlineArtifactError = await captureFailure(() =>
      standaloneOutlineArtifact.execute({ name: 'missing', filename: 'proposal.md' }),
    )
    const kernelOutlineArtifactError = await captureFailure(() =>
      kernel.changes.outlineArtifact.execute({ name: 'missing', filename: 'proposal.md' }),
    )
    expectSameFailure(outlineArtifactError, kernelOutlineArtifactError)

    const validateBatchError = await captureFailure(() =>
      standaloneValidateBatch.execute({ name: 'missing', artifactId: 'proposal' }),
    )
    const kernelValidateBatchError = await captureFailure(() =>
      kernel.changes.validateBatch.execute({ name: 'missing', artifactId: 'proposal' }),
    )
    expectSameFailure(validateBatchError, kernelValidateBatchError)
  })

  it('matches kernel log readback for structured and pretty output', async () => {
    const config = await makeConfig()
    const logRing = new LogRingBuffer(8)
    const kernel = await createKernel(config, { logRing })
    const standaloneReadLog = createReadLog(logRing)

    logRing.push(entry('first'))
    logRing.push(entry('second', 'warn'))

    expect(standaloneReadLog.execute({ limit: 2 })).toEqual(kernel.logs?.read.execute({ limit: 2 }))
    expect(standaloneReadLog.execute({ prettier: true })).toEqual(
      kernel.logs?.read.execute({ prettier: true }),
    )
  })
})
