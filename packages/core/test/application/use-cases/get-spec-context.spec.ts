import { describe, it, expect } from 'vitest'
import { GetSpecContext } from '../../../src/application/use-cases/get-spec-context.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { makeSpecRepository, makeContentHasher } from './helpers.js'
import { WorkspaceNotFoundError } from '../../../src/application/errors/workspace-not-found-error.js'
import { SpecNotFoundError } from '../../../src/application/errors/spec-not-found-error.js'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GetSpecContext', () => {
  it('returns context entries for a single spec', async () => {
    const hasher = makeContentHasher()
    const specContent = '# Auth Login Spec'
    const contentHash = hasher.hash(specContent)
    const metadataContent = [
      'title: Login Flow',
      'description: Handles user login',
      `contentHashes:`,
      `  spec.md: "${contentHash}"`,
    ].join('\n')

    const spec = new Spec('default', SpecPath.parse('auth/login'), [
      'spec.md',
      '.specd-metadata.yaml',
    ])
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: {
        'auth/login/spec.md': specContent,
        'auth/login/.specd-metadata.yaml': metadataContent,
      },
    })
    const specRepos = new Map([['default', repo]])

    const uc = new GetSpecContext(specRepos, hasher)
    const result = await uc.execute({
      workspace: 'default',
      specPath: SpecPath.parse('auth/login'),
    })

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.spec).toBe('default:auth/login')
    expect(result.entries[0]!.stale).toBe(false)
    expect(result.entries[0]!.title).toBe('Login Flow')
    expect(result.entries[0]!.description).toBe('Handles user login')
    expect(result.warnings).toHaveLength(0)
  })

  it('throws WorkspaceNotFoundError when workspace not found', async () => {
    const specRepos = new Map([['default', makeSpecRepository()]])

    const uc = new GetSpecContext(specRepos, makeContentHasher())
    await expect(
      uc.execute({
        workspace: 'nonexistent',
        specPath: SpecPath.parse('auth/login'),
      }),
    ).rejects.toThrow(WorkspaceNotFoundError)
  })

  it('throws SpecNotFoundError when spec not found', async () => {
    const repo = makeSpecRepository({ specs: [] })
    const specRepos = new Map([['default', repo]])

    const uc = new GetSpecContext(specRepos, makeContentHasher())
    await expect(
      uc.execute({
        workspace: 'default',
        specPath: SpecPath.parse('nonexistent/spec'),
      }),
    ).rejects.toThrow(SpecNotFoundError)
  })

  it('returns warnings for stale metadata', async () => {
    const metadataContent = [
      'title: Login Flow',
      'contentHashes:',
      '  spec.md: "sha256:stale-hash-that-does-not-match"',
    ].join('\n')

    const spec = new Spec('default', SpecPath.parse('auth/login'), [
      'spec.md',
      '.specd-metadata.yaml',
    ])
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: {
        'auth/login/spec.md': '# Actual content that changed',
        'auth/login/.specd-metadata.yaml': metadataContent,
      },
    })
    const specRepos = new Map([['default', repo]])

    const uc = new GetSpecContext(specRepos, makeContentHasher())
    const result = await uc.execute({
      workspace: 'default',
      specPath: SpecPath.parse('auth/login'),
    })

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.stale).toBe(true)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]!.type).toBe('stale-metadata')
  })
})
