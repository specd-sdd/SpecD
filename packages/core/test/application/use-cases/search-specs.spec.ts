import { describe, it, expect, vi } from 'vitest'
import { SearchSpecs } from '../../../src/application/use-cases/search-specs.js'
import { type SpecSearchResult } from '../../../src/application/ports/spec-repository.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { makeSpecRepository, makeContentHasher } from './helpers.js'
import { type YamlSerializer } from '../../../src/application/ports/yaml-serializer.js'

function makeYamlSerializer(): YamlSerializer {
  return {
    parse(): unknown {
      return null
    },
    stringify(): string {
      return ''
    },
  }
}

function mockSearchRepo(
  workspace: string,
  specs: Spec[],
  searchResults: SpecSearchResult[],
): ReturnType<typeof makeSpecRepository> {
  const repo = makeSpecRepository({ specs, workspace })
  vi.spyOn(repo, 'search').mockResolvedValue(searchResults)
  return repo
}

describe('SearchSpecs', () => {
  it('merges results across workspaces', async () => {
    const spec1 = new Spec('alpha', SpecPath.parse('auth/login'), ['spec.md'])
    const spec2 = new Spec('beta', SpecPath.parse('billing/pay'), ['spec.md'])

    const repo1 = mockSearchRepo(
      'alpha',
      [spec1],
      [{ spec: spec1, score: 3, matches: [{ filename: 'spec.md', line: 1, snippet: 'auth' }] }],
    )
    const repo2 = mockSearchRepo(
      'beta',
      [spec2],
      [{ spec: spec2, score: 5, matches: [{ filename: 'spec.md', line: 1, snippet: 'billing' }] }],
    )

    const specRepos = new Map([
      ['alpha', repo1],
      ['beta', repo2],
    ])

    const uc = new SearchSpecs(specRepos, makeContentHasher(), makeYamlSerializer())
    const result = await uc.execute('keyword')

    expect(result).toHaveLength(2)
    expect(result[0]!.workspace).toBe('beta')
    expect(result[0]!.score).toBe(5)
    expect(result[1]!.workspace).toBe('alpha')
    expect(result[1]!.score).toBe(3)
  })

  it('filters by workspace', async () => {
    const spec1 = new Spec('alpha', SpecPath.parse('auth/login'), ['spec.md'])
    const spec2 = new Spec('beta', SpecPath.parse('billing/pay'), ['spec.md'])

    const repo1 = mockSearchRepo(
      'alpha',
      [spec1],
      [{ spec: spec1, score: 1, matches: [{ filename: 'spec.md', line: 1, snippet: 'auth' }] }],
    )
    const repo2 = mockSearchRepo(
      'beta',
      [spec2],
      [{ spec: spec2, score: 2, matches: [{ filename: 'spec.md', line: 1, snippet: 'billing' }] }],
    )

    const specRepos = new Map([
      ['alpha', repo1],
      ['beta', repo2],
    ])

    const uc = new SearchSpecs(specRepos, makeContentHasher(), makeYamlSerializer())
    const result = await uc.execute('keyword', { workspaces: ['alpha'] })

    expect(result).toHaveLength(1)
    expect(result[0]!.workspace).toBe('alpha')
  })

  it('handles repo errors silently', async () => {
    const spec1 = new Spec('alpha', SpecPath.parse('auth/login'), ['spec.md'])
    const spec2 = new Spec('beta', SpecPath.parse('billing/pay'), ['spec.md'])

    const repo1 = mockSearchRepo(
      'alpha',
      [spec1],
      [{ spec: spec1, score: 1, matches: [{ filename: 'spec.md', line: 1, snippet: 'auth' }] }],
    )
    const repo2 = mockSearchRepo('beta', [spec2], [])
    vi.spyOn(repo2, 'search').mockRejectedValue(new Error('disk error'))

    const specRepos = new Map([
      ['alpha', repo1],
      ['beta', repo2],
    ])

    const uc = new SearchSpecs(specRepos, makeContentHasher(), makeYamlSerializer())
    const result = await uc.execute('keyword')

    expect(result).toHaveLength(1)
    expect(result[0]!.workspace).toBe('alpha')
  })

  it('returns empty when no matches', async () => {
    const repo = mockSearchRepo('default', [], [])
    const specRepos = new Map([['default', repo]])

    const uc = new SearchSpecs(specRepos, makeContentHasher(), makeYamlSerializer())
    const result = await uc.execute('nonexistent')

    expect(result).toEqual([])
  })

  it('resolves title from spec path fallback', async () => {
    const spec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
    const repo = mockSearchRepo(
      'default',
      [spec],
      [{ spec, score: 1, matches: [{ filename: 'spec.md', line: 1, snippet: 'auth' }] }],
    )

    const specRepos = new Map([['default', repo]])
    const uc = new SearchSpecs(specRepos, makeContentHasher(), makeYamlSerializer())
    const result = await uc.execute('auth')

    expect(result[0]!.title).toBe('login')
  })

  it('resolves title from metadata when available', async () => {
    const spec = new Spec('default', SpecPath.parse('auth/login'), [
      'spec.md',
      '.specd-metadata.yaml',
    ])
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: {
        'auth/login/.specd-metadata.yaml': JSON.stringify({ title: 'Login Flow' }),
      },
    })
    vi.spyOn(repo, 'search').mockResolvedValue([
      { spec, score: 1, matches: [{ filename: 'spec.md', line: 1, snippet: 'auth' }] },
    ])

    const specRepos = new Map([['default', repo]])
    const uc = new SearchSpecs(specRepos, makeContentHasher(), makeYamlSerializer())
    const result = await uc.execute('auth')

    expect(result[0]!.title).toBe('Login Flow')
  })

  it('resolves summary when includeSummary is true', async () => {
    const spec = new Spec('default', SpecPath.parse('auth/login'), [
      'spec.md',
      '.specd-metadata.yaml',
    ])
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: {
        'auth/login/.specd-metadata.yaml': JSON.stringify({
          title: 'Login',
          description: 'User login flow',
        }),
      },
    })
    vi.spyOn(repo, 'search').mockResolvedValue([
      { spec, score: 1, matches: [{ filename: 'spec.md', line: 1, snippet: 'auth' }] },
    ])

    const specRepos = new Map([['default', repo]])
    const uc = new SearchSpecs(specRepos, makeContentHasher(), makeYamlSerializer())
    const result = await uc.execute('auth', { includeSummary: true })

    expect(result[0]!.summary).toBe('User login flow')
  })

  it('respects limit option', async () => {
    const spec1 = new Spec('alpha', SpecPath.parse('a/one'), ['spec.md'])
    const spec2 = new Spec('beta', SpecPath.parse('b/two'), ['spec.md'])
    const spec3 = new Spec('gamma', SpecPath.parse('c/three'), ['spec.md'])

    const repo1 = mockSearchRepo(
      'alpha',
      [spec1],
      [{ spec: spec1, score: 3, matches: [{ filename: 'spec.md', line: 1, snippet: 'k' }] }],
    )
    const repo2 = mockSearchRepo(
      'beta',
      [spec2],
      [{ spec: spec2, score: 5, matches: [{ filename: 'spec.md', line: 1, snippet: 'k' }] }],
    )
    const repo3 = mockSearchRepo(
      'gamma',
      [spec3],
      [{ spec: spec3, score: 1, matches: [{ filename: 'spec.md', line: 1, snippet: 'k' }] }],
    )

    const specRepos = new Map([
      ['alpha', repo1],
      ['beta', repo2],
      ['gamma', repo3],
    ])

    const uc = new SearchSpecs(specRepos, makeContentHasher(), makeYamlSerializer())
    const result = await uc.execute('k', { limit: 2 })

    expect(result).toHaveLength(2)
    expect(result[0]!.score).toBe(5)
    expect(result[1]!.score).toBe(3)
  })
})
