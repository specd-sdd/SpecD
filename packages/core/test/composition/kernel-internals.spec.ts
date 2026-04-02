import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createKernelInternals } from '../../src/composition/kernel-internals.js'
import { NullActorResolver } from '../../src/infrastructure/null/actor-resolver.js'
import { NullVcsAdapter } from '../../src/infrastructure/null/vcs-adapter.js'
import { type SpecdConfig } from '../../src/application/specd-config.js'

let tmpDir: string | undefined

describe('createKernelInternals', () => {
  afterEach(async () => {
    if (tmpDir !== undefined) {
      await fs.rm(tmpDir, { recursive: true, force: true })
      tmpDir = undefined
    }
  })

  it('returns null VCS adapters when the project root is not under version control', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-kernel-internals-'))
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

    const config: SpecdConfig = {
      projectRoot: tmpDir,
      configPath: path.join(tmpDir, '.specd', 'config'),
      schemaRef: '@specd/schema-std',
      workspaces: [
        {
          name: 'default',
          prefix: '_global',
          specsPath,
          schemasPath: null,
          codeRoot: tmpDir,
          ownership: 'owned',
          isExternal: false,
        },
      ],
      storage: {
        changesPath,
        draftsPath,
        discardedPath,
        archivePath,
      },
      approvals: {
        spec: false,
        signoff: false,
      },
    }

    const internals = await createKernelInternals(config)

    expect(internals.actor).toBeInstanceOf(NullActorResolver)
    expect(internals.vcs).toBeInstanceOf(NullVcsAdapter)
  })
})
