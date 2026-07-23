import { describe, it, expect, vi } from 'vitest'
import { makeSpec } from '../../helpers/make-spec.js'
import { SearchSpecs } from '../../../src/application/use-cases/search-specs.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { makeSpecRepository, makeContentHasher, makeListWorkspaces } from './helpers.js'

import { type YamlSerializer } from '../../../src/application/ports/yaml-serializer.js'

function makeYamlSerializer(): YamlSerializer {
  return {
    parse: vi.fn().mockReturnValue({}),
    serialize: vi.fn().mockReturnValue(''),
    parseDelta: vi.fn().mockReturnValue([]),
  } as unknown as YamlSerializer
}

describe('SearchSpecs', () => {
  it('returns results across all workspaces', async () => {
    const repoA = makeSpecRepository({
      specs: [makeSpec({ workspace: 'a', name: 'foo', filenames: ['spec.md'] })],
    })
    const repoB = makeSpecRepository({
      specs: [makeSpec({ workspace: 'b', name: 'bar', filenames: ['spec.md'] })],
    })
    repoA.search = async () => [
      {
        spec: makeSpec({ workspace: 'a', name: 'foo', filenames: ['spec.md'] }),
        score: 1,
        matches: [],
      },
    ]
    repoB.search = async () => [
      {
        spec: makeSpec({ workspace: 'b', name: 'bar', filenames: ['spec.md'] }),
        score: 2,
        matches: [],
      },
    ]

    const specRepos = new Map([
      ['a', repoA],
      ['b', repoB],
    ])
    const uc = new SearchSpecs(
      makeListWorkspaces(specRepos),
      makeContentHasher(),
      makeYamlSerializer(),
    )

    const result = (await uc.execute('query')) as any[]

    expect(result).toHaveLength(2)
    expect(result[0]!.workspace).toBe('b') // ranked by score
    expect(result[1]!.workspace).toBe('a')
  })

  it('filters by workspace when provided', async () => {
    const repoA = makeSpecRepository()
    const repoB = makeSpecRepository()
    repoA.search = async () => [
      { spec: makeSpec({ workspace: 'a', name: 'foo', filenames: [] }), score: 1, matches: [] },
    ]
    repoB.search = async () => [
      { spec: makeSpec({ workspace: 'b', name: 'bar', filenames: [] }), score: 1, matches: [] },
    ]

    const specRepos = new Map([
      ['a', repoA],
      ['b', repoB],
    ])
    const uc = new SearchSpecs(
      makeListWorkspaces(specRepos),
      makeContentHasher(),
      makeYamlSerializer(),
    )

    const result = await uc.execute('query', { workspaces: ['a'] })

    expect(result).toHaveLength(1)
    expect(result[0]!.workspace).toBe('a')
  })

  it('limits results when limit is provided', async () => {
    const repo = makeSpecRepository()
    repo.search = async () => [
      { spec: makeSpec({ workspace: 'default', name: 'a', filenames: [] }), score: 3, matches: [] },
      { spec: makeSpec({ workspace: 'default', name: 'b', filenames: [] }), score: 2, matches: [] },
      { spec: makeSpec({ workspace: 'default', name: 'c', filenames: [] }), score: 1, matches: [] },
    ]

    const specRepos = new Map([['default', repo]])
    const uc = new SearchSpecs(
      makeListWorkspaces(specRepos),
      makeContentHasher(),
      makeYamlSerializer(),
    )

    const result = await uc.execute('query', { limit: 2 })

    expect(result).toHaveLength(2)
    expect(result[0]!.path).toBe('a')
    expect(result[1]!.path).toBe('b')
  })

  it('includes summaries when requested', async () => {
    const repo = makeSpecRepository({
      specs: [makeSpec({ workspace: 'default', name: 'foo', filenames: ['spec.md'] })],
      artifacts: {
        'foo/spec.md': '# Title\n\nThis is a summary.',
      },
    })
    repo.search = async () => [
      {
        spec: makeSpec({ workspace: 'default', name: 'foo', filenames: ['spec.md'] }),
        score: 1,
        matches: [],
      },
    ]

    const specRepos = new Map([['default', repo]])
    const uc = new SearchSpecs(
      makeListWorkspaces(specRepos),
      makeContentHasher(),
      makeYamlSerializer(),
    )

    const result = await uc.execute('query', { includeSummary: true })

    expect(result[0]!.summary).toBe('This is a summary.')
  })

  it('resolves title from metadata first', async () => {
    const repo = makeSpecRepository({
      specs: [
        makeSpec({ workspace: 'default', name: 'foo', filenames: ['spec.md', 'metadata.json'] }),
      ],
      artifacts: {
        'foo/metadata.json': JSON.stringify({ title: 'Metadata Title' }),
        'foo/spec.md': '# Header Title',
      },
    })
    repo.search = async () => [
      {
        spec: makeSpec({ workspace: 'default', name: 'foo', filenames: ['spec.md'] }),
        score: 1,
        matches: [],
      },
    ]

    const specRepos = new Map([['default', repo]])
    const uc = new SearchSpecs(
      makeListWorkspaces(specRepos),
      makeContentHasher(),
      makeYamlSerializer(),
    )

    const result = (await uc.execute('query')) as any[]

    expect(result[0]!.title).toBe('Metadata Title')
  })

  it('falls back to H1 header for title when metadata lacks it', async () => {
    const repo = makeSpecRepository({
      specs: [makeSpec({ workspace: 'default', name: 'foo', filenames: ['spec.md'] })],
      artifacts: {
        'foo/spec.md': '# Header Title',
      },
    })
    repo.search = async () => [
      {
        spec: makeSpec({ workspace: 'default', name: 'foo', filenames: ['spec.md'] }),
        score: 1,
        matches: [],
      },
    ]

    const specRepos = new Map([['default', repo]])
    const uc = new SearchSpecs(
      makeListWorkspaces(specRepos),
      makeContentHasher(),
      makeYamlSerializer(),
    )

    const result = (await uc.execute('query')) as any[]

    expect(result[0]!.title).toBe('Header Title')
  })

  it('falls back to spec path for title when neither exists', async () => {
    const repo = makeSpecRepository({
      specs: [makeSpec({ workspace: 'default', name: 'foo/bar', filenames: [] })],
    })
    repo.search = async () => [
      {
        spec: makeSpec({ workspace: 'default', name: 'foo/bar', filenames: [] }),
        score: 1,
        matches: [],
      },
    ]

    const specRepos = new Map([['default', repo]])
    const uc = new SearchSpecs(
      makeListWorkspaces(specRepos),
      makeContentHasher(),
      makeYamlSerializer(),
    )

    const result = (await uc.execute('query')) as any[]

    expect(result[0]!.title).toBe('foo/bar')
  })

  it('handles empty results gracefully', async () => {
    const repo = makeSpecRepository()
    repo.search = async () => []

    const specRepos = new Map([['default', repo]])
    const uc = new SearchSpecs(
      makeListWorkspaces(specRepos),
      makeContentHasher(),
      makeYamlSerializer(),
    )

    const result = (await uc.execute('query')) as any[]

    expect(result).toEqual([])
  })
})
