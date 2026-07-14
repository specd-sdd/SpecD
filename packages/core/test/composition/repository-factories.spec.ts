import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createSpecRepository,
  createChangeRepository,
  createArchiveRepository,
  createSchemaRepository,
  type ChangeRepositoryConfig,
  type ArchiveRepositoryConfig,
} from '../../src/public.js'
import { type SpecdConfig } from '../../src/application/specd-config.js'
import { UnknownAdapterError } from '../../src/domain/errors/index.js'
import { StorageDirectoryNotFoundError } from '../../src/domain/errors/index.js'
import { ZodError } from 'zod'

describe('Repository Composition Factories', () => {
  let tmpDir: string
  let specsPath: string
  let changesPath: string
  let draftsPath: string
  let discardedPath: string
  let archivePath: string
  let schemasPath: string
  let configPath: string

  let metadataPath: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-factories-test-'))
    specsPath = path.join(tmpDir, 'specs')
    metadataPath = path.join(tmpDir, 'metadata')
    changesPath = path.join(tmpDir, 'changes')
    draftsPath = path.join(tmpDir, 'drafts')
    discardedPath = path.join(tmpDir, 'discarded')
    archivePath = path.join(tmpDir, 'archive')
    schemasPath = path.join(tmpDir, 'schemas')
    configPath = path.join(tmpDir, 'specd.yaml')

    await Promise.all([
      fs.mkdir(specsPath, { recursive: true }),
      fs.mkdir(metadataPath, { recursive: true }),
      fs.mkdir(changesPath, { recursive: true }),
      fs.mkdir(draftsPath, { recursive: true }),
      fs.mkdir(discardedPath, { recursive: true }),
      fs.mkdir(archivePath, { recursive: true }),
      fs.mkdir(schemasPath, { recursive: true }),
    ])
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  function makeConfig(): SpecdConfig {
    return {
      projectRoot: tmpDir,
      configPath,
      schemaRef: '@specd/schema-std',
      workspaces: [
        {
          name: 'default',
          specsPath,
          specsAdapter: { adapter: 'fs', config: { path: specsPath } },
          schemasPath,
          schemasAdapter: { adapter: 'fs', config: { path: schemasPath } },
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

  describe('createSpecRepository', () => {
    it('constructs an FsSpecRepository from Config', () => {
      const config = makeConfig()
      const repo = createSpecRepository(config)
      expect(repo).toBeDefined()
      expect(repo.workspace()).toBe('default')
    })

    it('constructs directly via adapter type and config', () => {
      const repo = createSpecRepository(
        'fs',
        {
          workspace: 'default',
          ownership: 'owned',
          isExternal: false,
          configPath,
        },
        { path: specsPath, metadataPath: path.join(tmpDir, 'metadata') },
      )
      expect(repo).toBeDefined()
    })

    it('throws UnknownAdapterError for registered adapter types', () => {
      expect(() =>
        createSpecRepository(
          'unknown_adapter_type',
          {
            workspace: 'default',
            ownership: 'owned',
            isExternal: false,
            configPath,
          },
          { path: specsPath },
        ),
      ).toThrow(UnknownAdapterError)
    })

    it('throws validation error for invalid options', () => {
      expect(() =>
        createSpecRepository(
          'fs',
          {
            workspace: 'default',
            ownership: 'owned',
            isExternal: false,
            configPath,
          },
          { path: 123 }, // path should be a string
        ),
      ).toThrow(ZodError)
    })

    it('throws StorageDirectoryNotFoundError when specs path does not exist', () => {
      expect(() =>
        createSpecRepository(
          'fs',
          {
            workspace: 'default',
            ownership: 'owned',
            isExternal: false,
            configPath,
          },
          { path: path.join(tmpDir, 'nonexistent'), metadataPath: path.join(tmpDir, 'metadata') },
        ),
      ).toThrow(StorageDirectoryNotFoundError)
    })
  })

  describe('createChangeRepository', () => {
    it('constructs FsChangeRepository from Config', () => {
      const config = makeConfig()
      const repo = createChangeRepository(config)
      expect(repo).toBeDefined()
    })

    it('constructs directly via adapter type and config', () => {
      const repo = createChangeRepository(
        'fs',
        {
          workspace: 'default',
          ownership: 'owned',
          isExternal: false,
          configPath,
          draftsPath,
          discardedPath,
        } as unknown as ChangeRepositoryConfig,
        { path: changesPath },
      )
      expect(repo).toBeDefined()
    })

    it('throws validation error for invalid options', () => {
      expect(() =>
        createChangeRepository(
          'fs',
          {
            workspace: 'default',
            ownership: 'owned',
            isExternal: false,
            configPath,
            draftsPath,
            discardedPath,
          } as unknown as ChangeRepositoryConfig,
          { path: 123 },
        ),
      ).toThrow(ZodError)
    })

    it('throws StorageDirectoryNotFoundError when path does not exist', () => {
      expect(() =>
        createChangeRepository(
          'fs',
          {
            workspace: 'default',
            ownership: 'owned',
            isExternal: false,
            configPath,
            draftsPath,
            discardedPath,
          } as unknown as ChangeRepositoryConfig,
          { path: path.join(tmpDir, 'nonexistent') },
        ),
      ).toThrow(StorageDirectoryNotFoundError)
    })
  })

  describe('createArchiveRepository', () => {
    it('constructs FsArchiveRepository from Config', () => {
      const config = makeConfig()
      const repo = createArchiveRepository(config)
      expect(repo).toBeDefined()
    })

    it('constructs directly via adapter type and config', () => {
      const repo = createArchiveRepository(
        'fs',
        {
          workspace: 'default',
          ownership: 'owned',
          isExternal: false,
          configPath,
          changesPath,
          draftsPath,
        } as unknown as ArchiveRepositoryConfig,
        { path: archivePath },
      )
      expect(repo).toBeDefined()
    })

    it('throws validation error for invalid options', () => {
      expect(() =>
        createArchiveRepository(
          'fs',
          {
            workspace: 'default',
            ownership: 'owned',
            isExternal: false,
            configPath,
            changesPath,
            draftsPath,
          } as unknown as ArchiveRepositoryConfig,
          { path: 123 },
        ),
      ).toThrow(ZodError)
    })

    it('throws StorageDirectoryNotFoundError when path does not exist', () => {
      expect(() =>
        createArchiveRepository(
          'fs',
          {
            workspace: 'default',
            ownership: 'owned',
            isExternal: false,
            configPath,
            changesPath,
            draftsPath,
          } as unknown as ArchiveRepositoryConfig,
          { path: path.join(tmpDir, 'nonexistent') },
        ),
      ).toThrow(StorageDirectoryNotFoundError)
    })
  })

  describe('createSchemaRepository', () => {
    it('constructs FsSchemaRepository from Config', () => {
      const config = makeConfig()
      const repo = createSchemaRepository(config)
      expect(repo).toBeDefined()
    })

    it('constructs directly via adapter type and config', () => {
      const repo = createSchemaRepository(
        'fs',
        {
          workspace: 'default',
          ownership: 'owned',
          isExternal: false,
          configPath,
        },
        { path: schemasPath },
      )
      expect(repo).toBeDefined()
    })

    it('throws validation error for invalid options', () => {
      expect(() =>
        createSchemaRepository(
          'fs',
          {
            workspace: 'default',
            ownership: 'owned',
            isExternal: false,
            configPath,
          },
          { path: 123 },
        ),
      ).toThrow(ZodError)
    })

    it('throws StorageDirectoryNotFoundError when path does not exist', () => {
      expect(() =>
        createSchemaRepository(
          'fs',
          {
            workspace: 'default',
            ownership: 'owned',
            isExternal: false,
            configPath,
          },
          { path: path.join(tmpDir, 'nonexistent') },
        ),
      ).toThrow(StorageDirectoryNotFoundError)
    })
  })
})
