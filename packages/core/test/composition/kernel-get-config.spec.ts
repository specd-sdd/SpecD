import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createKernel } from '../../src/composition/kernel.js'
import { GetConfig } from '../../src/application/use-cases/get-config.js'
import { type SpecdConfig } from '../../src/application/specd-config.js'

let tmpDir: string | undefined

afterEach(async () => {
  if (tmpDir !== undefined) {
    await fs.rm(tmpDir, { recursive: true, force: true })
    tmpDir = undefined
  }
})

/**
 * Creates a minimal fs-backed config for kernel getConfig tests.
 *
 * @returns A resolved {@link SpecdConfig}
 */
async function makeConfig(): Promise<SpecdConfig> {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-kernel-get-config-'))
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

describe('createKernel project.getConfig', () => {
  describe('given a wired kernel', () => {
    it('exposes GetConfig and returns a detached snapshot', async () => {
      const config = await makeConfig()
      const kernel = await createKernel(config)

      expect(kernel.project.getConfig).toBeInstanceOf(GetConfig)

      const snapshot = kernel.project.getConfig.execute()
      expect(snapshot).toEqual(config)
      expect(snapshot).not.toBe(config)
    })

    it('keeps listWorkspaces stable when the host mutates the returned snapshot', async () => {
      const config = await makeConfig()
      const kernel = await createKernel(config)

      const before = await kernel.project.listWorkspaces.execute()
      const hostView = kernel.project.getConfig.execute()

      const workspaces = hostView.workspaces as SpecdConfig['workspaces'] & {
        push: (v: unknown) => number
      }
      workspaces.push({
        name: 'injected',
        specsPath: '/tmp/injected/specs',
        specsAdapter: { adapter: 'fs', config: { path: '/tmp/injected/specs' } },
        schemasPath: null,
        schemasAdapter: null,
        codeRoot: '/tmp/injected',
        ownership: 'owned',
        isExternal: false,
      })

      const after = await kernel.project.listWorkspaces.execute()
      expect(after).toEqual(before)
      expect(config.workspaces).toHaveLength(1)
    })
  })
})
