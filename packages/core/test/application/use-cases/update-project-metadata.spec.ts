import { describe, it, expect, vi } from 'vitest'
import { UpdateProjectMetadata } from '../../../src/application/use-cases/update-project-metadata.js'
import { type SpecdConfig } from '../../../src/application/specd-config.js'
import { type ListWorkspaces } from '../../../src/application/use-cases/list-workspaces.js'
import { type SpecRepository } from '../../../src/application/ports/spec-repository.js'
import { type FileReader } from '../../../src/application/ports/file-reader.js'
import { type FileWriter } from '../../../src/application/ports/file-writer.js'
import { type ContentHasher } from '../../../src/application/ports/content-hasher.js'

describe('UpdateProjectMetadata', () => {
  it('computes hashes and saves project metadata', async () => {
    const config = {
      configPath: '/project/.specd',
      projectRoot: '/project',
      context: [{ file: 'AGENTS.md' }],
      contextIncludeSpecs: ['default:*'],
    } as unknown as SpecdConfig

    const specRepo = {
      list: vi.fn().mockResolvedValue([{ name: { toString: () => 'auth/login' } }]),
      metadata: vi.fn().mockResolvedValue({
        contentHashes: { 'spec.md': 'sha256:spec' },
      }),
    } as unknown as SpecRepository

    const listWorkspaces = {
      execute: vi.fn().mockResolvedValue([{ name: 'default', specRepo }]),
    } as unknown as ListWorkspaces

    const specRepos = new Map([['default', specRepo]])

    const files = {
      read: vi.fn().mockImplementation((path) => {
        if (path === '/project/specd.yaml') return 'config content'
        if (path.includes('AGENTS.md')) return 'agents content'
        return null
      }),
    } as unknown as FileReader

    const fileWriter = {
      write: vi.fn().mockResolvedValue(undefined),
    } as unknown as FileWriter

    const hasher = {
      hash: vi.fn().mockImplementation((c) => `hash(${c})`),
    } as unknown as ContentHasher

    const useCase = new UpdateProjectMetadata(
      config,
      listWorkspaces,
      specRepos,
      files,
      fileWriter,
      hasher,
    )

    const result = await useCase.execute({
      payload: { optimizedContext: 'Optimized Context' },
    })

    expect(fileWriter.write).toHaveBeenCalledWith(
      '/project/.specd/project-metadata.json',
      expect.stringContaining('Optimized Context'),
    )
    const savedMetadataRaw = vi.mocked(fileWriter.write).mock.calls[0]?.[1]
    expect(savedMetadataRaw).toBeDefined()
    const savedMetadata = JSON.parse(savedMetadataRaw as string)
    expect(savedMetadata.optimized.context).toBe('Optimized Context')
    expect(savedMetadata.freshness.inputs.config.hash).toBe('hash(config content)')
    expect(savedMetadata.freshness.inputs.contextFiles[0].hash).toBe('hash(agents content)')
    expect(savedMetadata.freshness.inputs.specMetadata[0].hash).toBe('hash(sha256:spec)')
    expect(result.path).toBe('/project/.specd/project-metadata.json')
  })
})
