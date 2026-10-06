import { describe, expect, it } from 'vitest'
import type { GuideCatalogPort } from '../../../src/application/ports/guide-catalog-port.js'
import { MiniSearchGuideEngineAdapter } from '../../../src/infrastructure/adapters/minisearch-guide-engine-adapter.js'
import type { GuideSection, GuideSummary, GuideTopic } from '../../../src/domain/models/index.js'

describe('MiniSearchGuideEngineAdapter', () => {
  const testSections1: GuideSection[] = [
    {
      index: 1,
      heading: 'Introduction',
      level: 1,
      startLine: 1,
      endLine: 10,
      lines: 10,
      startOffset: 0,
      endOffset: 100,
      content: '# Introduction\nSpecD provides spec-driven development tooling.',
    },
    {
      index: 2,
      heading: 'Lifecycle States',
      level: 2,
      startLine: 11,
      endLine: 30,
      lines: 20,
      startOffset: 101,
      endOffset: 300,
      content:
        '## Lifecycle States\nA change moves through drafting, designing, ready, implementing.',
    },
  ]

  const testSections2: GuideSection[] = [
    {
      index: 1,
      heading: 'Configuring Schemas',
      level: 1,
      startLine: 1,
      endLine: 25,
      lines: 25,
      startOffset: 0,
      endOffset: 250,
      content: '# Configuring Schemas\nSchemas govern workflow transitions and artifact rules.',
    },
    {
      index: 2,
      heading: 'Standard Schema',
      level: 2,
      startLine: 26,
      endLine: 50,
      lines: 25,
      startOffset: 251,
      endOffset: 500,
      content:
        '## Standard Schema\nThe standard schema defines proposal, specs, verify, design, tasks.',
    },
  ]

  const testGuides: GuideTopic[] = [
    {
      collection: 'guide',
      sourcePath: 'workflow.md',
      topic: 'workflow',
      title: 'Change Lifecycle Workflow',
      description: 'Understanding change lifecycles',
      order: 1,
      content: 'Full workflow doc content',
      lineCount: 30,
      byteLength: 500,
      outline: testSections1,
    },
    {
      collection: 'guide',
      sourcePath: 'schemas.md',
      topic: 'schemas',
      title: 'Workflow Schemas Reference',
      description: 'Schemas guide',
      order: 2,
      content: 'Full schemas doc content',
      lineCount: 50,
      byteLength: 800,
      outline: testSections2,
    },
  ]

  const mockCatalogPort: GuideCatalogPort = {
    async listGuides(): Promise<readonly GuideSummary[]> {
      return []
    },
    async getGuide(): Promise<GuideTopic | null> {
      return null
    },
    async getAllGuides(): Promise<readonly GuideTopic[]> {
      return testGuides
    },
    async getAllTopics(): Promise<readonly GuideTopic[]> {
      return testGuides
    },
    async getCollections(): Promise<readonly string[]> {
      return ['guide']
    },
  }

  const adapter = new MiniSearchGuideEngineAdapter(mockCatalogPort)

  it('finds results by term and ranks title/heading higher', async () => {
    const hits = await adapter.search('lifecycle')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]!.topic).toBe('workflow')
    expect(hits[0]!.sectionIndex).toBe(2)
    expect(hits[0]!.readCommand).toBe('specd guide workflow --section 2')
  })

  it('supports prefix and fuzzy search', async () => {
    // Prefix match: 'lifecyc'
    const prefixHits = await adapter.search('lifecyc')
    expect(prefixHits.length).toBeGreaterThan(0)
    expect(prefixHits[0]!.topic).toBe('workflow')

    // Fuzzy match: 'lifecykle' (1 character typo)
    const fuzzyHits = await adapter.search('lifecykle')
    expect(fuzzyHits.length).toBeGreaterThan(0)
  })

  it('scopes search results when topic is specified', async () => {
    // Both workflow and schemas mention 'workflow'
    const hitsWorkflowOnly = await adapter.search('workflow', { topic: 'workflow' })
    expect(hitsWorkflowOnly.every((h) => h.topic === 'workflow')).toBe(true)

    const hitsSchemasOnly = await adapter.search('workflow', { topic: 'schemas' })
    expect(hitsSchemasOnly.every((h) => h.topic === 'schemas')).toBe(true)
  })

  it('respects limit parameter', async () => {
    const hits = await adapter.search('spec', { limit: 1 })
    expect(hits).toHaveLength(1)
  })

  it('promotes an exact full-query hit before applying the result limit', async () => {
    const exactGuide: GuideTopic = {
      collection: 'guide',
      sourcePath: 'exact.md',
      topic: 'exact',
      title: 'Reference',
      description: 'Exact query fixture',
      order: 1,
      content: '# Reference\nThe exact phrase appears in this section.',
      lineCount: 2,
      byteLength: 52,
      outline: [
        {
          index: 1,
          heading: 'Reference',
          level: 1,
          startLine: 1,
          endLine: 2,
          lines: 2,
          startOffset: 0,
          endOffset: 52,
          content: '# Reference\nThe exact phrase appears in this section.',
        },
      ],
    }
    const partialGuide: GuideTopic = {
      collection: 'guide',
      sourcePath: 'partial.md',
      topic: 'partial',
      title: 'Exact reference',
      description: 'Partial query fixture',
      order: 2,
      content: '# Phrase guide\nThis section separates the two search terms.',
      lineCount: 2,
      byteLength: 59,
      outline: [
        {
          index: 1,
          heading: 'Phrase guide',
          level: 1,
          startLine: 1,
          endLine: 2,
          lines: 2,
          startOffset: 0,
          endOffset: 59,
          content: '# Phrase guide\nThis section separates the two search terms.',
        },
      ],
    }
    const rankingPort: GuideCatalogPort = {
      ...mockCatalogPort,
      async getAllTopics(): Promise<readonly GuideTopic[]> {
        return [partialGuide, exactGuide]
      },
    }
    const rankingAdapter = new MiniSearchGuideEngineAdapter(rankingPort)

    const hits = await rankingAdapter.search('exact phrase', { limit: 1 })

    expect(hits).toHaveLength(1)
    expect(hits[0]?.topic).toBe('exact')
    expect(hits[0]?.snippet).toContain('exact phrase')
  })

  it('generates line-numbered snippets around match', async () => {
    const hits = await adapter.search('drafting')
    expect(hits.length).toBeGreaterThan(0)
    const hit = hits[0]!
    expect(hit.snippet).toContain('|')
    expect(hit.snippet).toContain('drafting')
  })

  it('clamps snippet context to the matched section boundaries', async () => {
    const boundaryGuide: GuideTopic = {
      collection: 'guide',
      sourcePath: 'boundaries.md',
      topic: 'boundaries',
      title: 'Boundaries',
      description: 'Snippet boundary fixture',
      order: 1,
      content:
        '# Before\nbefore sentinel\nstill before\n## Target\ntarget ending\n## After\nafter sentinel',
      lineCount: 7,
      byteLength: 86,
      outline: [
        {
          index: 2,
          heading: 'Target',
          level: 2,
          startLine: 4,
          endLine: 5,
          lines: 2,
          startOffset: 37,
          endOffset: 62,
          content: '## Target\ntarget ending',
        },
      ],
    }
    const boundaryPort: GuideCatalogPort = {
      ...mockCatalogPort,
      async getAllTopics(): Promise<readonly GuideTopic[]> {
        return [boundaryGuide]
      },
    }
    const boundaryAdapter = new MiniSearchGuideEngineAdapter(boundaryPort)

    const [hit] = await boundaryAdapter.search('target', { snippetLines: 3 })

    expect(hit?.snippet).toContain('## Target')
    expect(hit?.snippet).toContain('target ending')
    expect(hit?.snippet).not.toContain('before sentinel')
    expect(hit?.snippet).not.toContain('after sentinel')
  })

  it('returns empty array when query is empty or whitespace', async () => {
    expect(await adapter.search('')).toEqual([])
    expect(await adapter.search('   ')).toEqual([])
  })

  it('handles rare queries and special characters without crashing', async () => {
    const hits = await adapter.search('!@#$%^&*()_+')
    expect(Array.isArray(hits)).toBe(true)
  })
})

describe('MiniSearchGuideEngineAdapter identifier expansion', () => {
  const camelCaseSections: GuideSection[] = [
    {
      index: 1,
      heading: 'FreshnessLatches',
      level: 1,
      startLine: 1,
      endLine: 12,
      lines: 12,
      startOffset: 0,
      endOffset: 120,
      content: '# FreshnessLatches\nTracks when a cached spec must be recomputed.',
    },
  ]

  const acronymSections: GuideSection[] = [
    {
      index: 1,
      heading: 'XMLError',
      level: 1,
      startLine: 1,
      endLine: 12,
      lines: 12,
      startOffset: 0,
      endOffset: 120,
      content: '# XMLError\nRaised when a schema document cannot be parsed.',
    },
  ]

  const identifierGuides: GuideTopic[] = [
    {
      collection: 'code-graph',
      sourcePath: 'interfaces/FreshnessLatches.md',
      topic: 'interfaces/FreshnessLatches',
      title: 'FreshnessLatches',
      description: 'Freshness tracking for the code graph',
      order: 1,
      content: '# FreshnessLatches\nTracks when a cached spec must be recomputed.',
      lineCount: 12,
      byteLength: 200,
      outline: camelCaseSections,
    },
    {
      collection: 'code-graph',
      sourcePath: 'types/XMLError.md',
      topic: 'types/XMLError',
      title: 'XMLError',
      description: 'Schema parse failure',
      order: 2,
      content: '# XMLError\nRaised when a schema document cannot be parsed.',
      lineCount: 12,
      byteLength: 200,
      outline: acronymSections,
    },
  ]

  const identifierCatalogPort: GuideCatalogPort = {
    async listGuides(): Promise<readonly GuideSummary[]> {
      return []
    },
    async getGuide(): Promise<GuideTopic | null> {
      return null
    },
    async getAllGuides(): Promise<readonly GuideSummary[]> {
      return []
    },
    async getAllTopics(): Promise<readonly GuideTopic[]> {
      return identifierGuides
    },
    async getCollections(): Promise<readonly string[]> {
      return ['code-graph']
    },
  }

  const adapter = new MiniSearchGuideEngineAdapter(identifierCatalogPort)

  it('finds a topic by the exact PascalCase name it is titled with', async () => {
    const hits = await adapter.search('FreshnessLatches')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]!.topic).toBe('interfaces/FreshnessLatches')
  })

  it('finds a topic when the name is lowercased by the caller', async () => {
    const hits = await adapter.search('freshnesslatches')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]!.topic).toBe('interfaces/FreshnessLatches')
  })

  it('finds a topic when the words of the name are typed as prose', async () => {
    const hits = await adapter.search('freshness latches')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]!.topic).toBe('interfaces/FreshnessLatches')
  })

  it('finds a topic from only one word of its name', async () => {
    const hits = await adapter.search('latches')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]!.topic).toBe('interfaces/FreshnessLatches')
  })

  it('splits an acronym from the following capitalized word', async () => {
    const hits = await adapter.search('xml')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]!.topic).toBe('types/XMLError')
  })

  it('returns a snippet centered on the matching line for a PascalCase query', async () => {
    const hits = await adapter.search('FreshnessLatches')
    expect(hits[0]!.snippet).toContain('FreshnessLatches')
  })

  it('still honors an explicit limit with expanded queries', async () => {
    const hits = await adapter.search('freshness latches', { limit: 1 })
    expect(hits).toHaveLength(1)
  })

  it('still scopes expanded queries to a collection filter', async () => {
    const hits = await adapter.search('freshness latches', { collections: ['sdk'] })
    expect(hits).toEqual([])
  })
})
