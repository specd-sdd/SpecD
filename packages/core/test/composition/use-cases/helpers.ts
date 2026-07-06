import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { type SpecdConfig } from '../../../src/application/specd-config.js'

/**
 * Tracks the temporary directory backing a composition factory fixture.
 */
export interface CompositionFactoryFixture {
  /** The temporary directory created for the test. */
  tmpDir: string | undefined
}

/**
 * Creates a minimal fs-backed config for composition factory smoke tests.
 *
 * @param prefix - Prefix used for the temporary directory name
 * @returns The resolved {@link SpecdConfig}
 */
export async function setupCompositionFactoryConfig(prefix: string): Promise<{
  fixture: CompositionFactoryFixture
  config: SpecdConfig
}> {
  const fixture: CompositionFactoryFixture = { tmpDir: undefined }
  fixture.tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`))
  const specsPath = path.join(fixture.tmpDir, 'specs')
  const changesPath = path.join(fixture.tmpDir, '.specd', 'changes')
  const draftsPath = path.join(fixture.tmpDir, '.specd', 'drafts')
  const discardedPath = path.join(fixture.tmpDir, '.specd', 'discarded')
  const archivePath = path.join(fixture.tmpDir, '.specd', 'archive')

  await Promise.all([
    fs.mkdir(specsPath, { recursive: true }),
    fs.mkdir(changesPath, { recursive: true }),
    fs.mkdir(draftsPath, { recursive: true }),
    fs.mkdir(discardedPath, { recursive: true }),
    fs.mkdir(archivePath, { recursive: true }),
  ])

  return {
    fixture,
    config: {
      projectRoot: fixture.tmpDir,
      configPath: path.join(fixture.tmpDir, 'specd.yaml'),
      schemaRef: '@specd/schema-std',
      workspaces: [
        {
          name: 'default',
          specsPath,
          specsAdapter: { adapter: 'fs', config: { path: specsPath } },
          schemasPath: null,
          schemasAdapter: null,
          codeRoot: fixture.tmpDir,
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
    },
  }
}

/**
 * Removes the temporary directory created for a composition factory fixture.
 *
 * @param fixture - Fixture state returned by {@link setupCompositionFactoryConfig}
 * @returns A promise that resolves once cleanup finishes
 */
export async function cleanupCompositionFactoryConfig(
  fixture: CompositionFactoryFixture,
): Promise<void> {
  if (fixture.tmpDir !== undefined) {
    await fs.rm(fixture.tmpDir, { recursive: true, force: true })
    fixture.tmpDir = undefined
  }
}
