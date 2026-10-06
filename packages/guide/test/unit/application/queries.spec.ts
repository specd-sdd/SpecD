import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GuideCatalogPort } from '../../../src/application/ports/guide-catalog-port.js'
import type {
  GuideSearchOptions,
  GuideSearchPort,
} from '../../../src/application/ports/guide-search-port.js'
import {
  GetGuideOutlineQuery,
  GetGuideQuery,
  GetGuideSectionQuery,
  ListGuidesQuery,
  SearchGuidesQuery,
} from '../../../src/application/queries/index.js'
import {
  GuideSectionAmbiguousError,
  GuideSectionNotFoundError,
  GuideTopicNotFoundError,
} from '../../../src/domain/errors/index.js'
import type {
  GuideSearchHit,
  GuideSection,
  GuideSummary,
  GuideTopic,
} from '../../../src/domain/models/index.js'

describe('Application Queries', () => {
  const sampleSections: GuideSection[] = [
    {
      index: 1,
      heading: 'Introduction',
      level: 1,
      startLine: 1,
      endLine: 10,
      lines: 10,
      startOffset: 0,
      endOffset: 100,
      content: '# Introduction\nWelcome to SpecD',
    },
    {
      index: 2,
      heading: 'Examples',
      level: 2,
      startLine: 11,
      endLine: 20,
      lines: 10,
      startOffset: 101,
      endOffset: 200,
      content: '## Examples\nBasic examples',
    },
    {
      index: 3,
      heading: 'Lifecycle States',
      level: 2,
      startLine: 21,
      endLine: 35,
      lines: 15,
      startOffset: 201,
      endOffset: 350,
      content: '## Lifecycle States\nStates details',
    },
    {
      index: 4,
      heading: 'Examples',
      level: 2,
      startLine: 36,
      endLine: 50,
      lines: 15,
      startOffset: 351,
      endOffset: 500,
      content: '## Examples\nAdvanced examples',
    },
  ]

  const sampleGuides: GuideTopic[] = [
    {
      collection: 'guide',
      topic: 'workflow',
      sourcePath: 'workflow.md',
      title: 'Change Lifecycle Guide',
      description: 'Workflow details',
      order: 2,
      content: 'Sample content workflow',
      lineCount: 50,
      byteLength: 200,
      outline: sampleSections,
    },
    {
      collection: 'guide',
      topic: 'getting-started',
      sourcePath: 'getting-started.md',
      title: 'Getting Started',
      description: 'Getting started guide',
      order: 1,
      content: 'Sample content getting started',
      lineCount: 30,
      byteLength: 150,
      outline: [sampleSections[0]!],
    },
  ]

  const mockCatalogPort: GuideCatalogPort = {
    async listGuides(): Promise<readonly GuideSummary[]> {
      return sampleGuides.map((g) => ({
        collection: g.collection,
        topic: g.topic,
        title: g.title,
        description: g.description,
        order: g.order,
        lineCount: g.lineCount,
        byteLength: g.byteLength,
      }))
    },
    async getGuide(topic: string): Promise<GuideTopic | null> {
      const normalized = topic.trim().toLowerCase().replace(/\.md$/, '')
      return sampleGuides.find((g) => `${g.collection}:${g.topic}` === normalized) ?? null
    },
    async getAllGuides(): Promise<readonly GuideTopic[]> {
      return sampleGuides
    },
    async getAllTopics(): Promise<readonly GuideTopic[]> {
      return sampleGuides
    },
    async getCollections(): Promise<readonly string[]> {
      return ['guide']
    },
  }

  // A catalog mixing one hand-written document with one generated API topic.
  const generatedTopics: readonly GuideTopic[] = [
    ...sampleGuides,
    {
      ...sampleGuides[0]!,
      topic: 'interfaces/ArtifactDag',
      title: 'ArtifactDag',
    },
  ]

  const generatedCatalogPort: GuideCatalogPort = {
    ...mockCatalogPort,
    async getGuide(topic: string): Promise<GuideTopic | null> {
      const normalized = topic.trim().toLowerCase().replace(/\.md$/, '')
      return (
        generatedTopics.find((g) => `${g.collection}:${g.topic}`.toLowerCase() === normalized) ??
        null
      )
    },
    async getAllGuides(): Promise<readonly GuideSummary[]> {
      return generatedTopics.map((g) => ({
        collection: g.collection,
        topic: g.topic,
        title: g.title,
        description: g.description,
        order: g.order,
        lineCount: g.lineCount,
        byteLength: g.byteLength,
      }))
    },
    async getAllTopics(): Promise<readonly GuideTopic[]> {
      return generatedTopics
    },
  }

  const mockSearchPort: GuideSearchPort = {
    async search(query: string, options?: GuideSearchOptions): Promise<readonly GuideSearchHit[]> {
      if (!query.trim()) return []
      return [
        {
          collection: 'guide',
          topic: 'workflow',
          file: 'workflow.md',
          section: 'Lifecycle States',
          sectionIndex: 3,
          level: 2,
          startLine: 21,
          endLine: 35,
          score: 5.5,
          snippet: '21 | ## Lifecycle States',
          readCommand: 'specd guide workflow --section 3',
        },
      ]
    },
  }

  describe('ListGuidesQuery', () => {
    it('sorts guides by order ascending, then topic alphabetically', async () => {
      const query = new ListGuidesQuery(mockCatalogPort)
      const result = await query.execute()
      expect(result.topics).toHaveLength(2)
      expect(result.topics[0]!.topic).toBe('getting-started')
      expect(result.topics[1]!.topic).toBe('workflow')
    })

    it('reports the page coordinates of an unpaginated result', async () => {
      const query = new ListGuidesQuery(mockCatalogPort)
      const { pagination } = await query.execute()
      expect(pagination).toEqual({
        page: 1,
        pageSize: 2,
        returned: 2,
        total: 2,
        totalPages: 1,
      })
      // Nothing is withheld when the whole catalog is returned.
      expect((await query.execute()).withheld).toBeUndefined()
    })

    it('clamps a page beyond the last page and a non-positive page size', async () => {
      const query = new ListGuidesQuery(mockCatalogPort)

      const beyond = await query.execute({ pagination: { page: 99, pageSize: 1 } })
      expect(beyond.pagination.page).toBe(2)
      expect(beyond.topics.map((t) => t.topic)).toEqual(['workflow'])

      const malformed = await query.execute({ pagination: { page: -5, pageSize: 0 } })
      expect(malformed.pagination.page).toBe(1)
      expect(malformed.pagination.pageSize).toBe(1)
      expect(malformed.pagination.totalPages).toBe(2)
    })

    it('reports which page each topic starts on', async () => {
      const query = new ListGuidesQuery(mockCatalogPort)
      const result = await query.execute({ pagination: { page: 2, pageSize: 1 } })
      expect(result.topics).toHaveLength(1)
      expect(result.topics[0]!.page).toBe(2)
    })

    it('reports the per-collection extents across every page', async () => {
      const query = new ListGuidesQuery(mockCatalogPort)
      const result = await query.execute({ pagination: { page: 1, pageSize: 1 } })
      expect(result.collections).toEqual([
        { collection: 'guide', total: 2, firstPage: 1, lastPage: 2 },
      ])
    })

    it('reports the generated topics the scope withholds', async () => {
      const query = new ListGuidesQuery(generatedCatalogPort)
      const handWritten = await query.execute({ scope: { generated: false } })
      expect(handWritten.withheld?.generatedTopics).toBe(1)

      // Requesting the generated topics explicitly withholds nothing, so the field
      // is absent rather than reported as zero.
      const generated = await query.execute({ scope: { generated: true } })
      expect(generated.withheld).toBeUndefined()

      const unscoped = await query.execute()
      expect(unscoped.withheld).toBeUndefined()
    })
  })

  describe('GetGuideQuery', () => {
    it('delegates normalized qualified lookup to getGuide', async () => {
      const getGuide = vi.fn(mockCatalogPort.getGuide.bind(mockCatalogPort))
      const query = new GetGuideQuery({ ...mockCatalogPort, getGuide })

      await query.execute({ topic: '  GUIDE:WORKFLOW.md  ' })

      expect(getGuide).toHaveBeenCalledOnce()
      expect(getGuide).toHaveBeenCalledWith('guide:workflow')
    })

    it('does not enumerate catalog topics after a successful normalized qualified lookup', async () => {
      const getAllTopics = vi.fn(mockCatalogPort.getAllTopics.bind(mockCatalogPort))
      const query = new GetGuideQuery({ ...mockCatalogPort, getAllTopics })

      const guide = await query.execute({ topic: '  GUIDE:WORKFLOW.md  ' })

      expect(guide.topic).toBe('workflow')
      expect(getAllTopics).not.toHaveBeenCalled()
    })

    it('rejects blank input before accessing the catalog port', async () => {
      const guardedPort: GuideCatalogPort = {
        listGuides: vi.fn(() => Promise.reject(new Error('port must not be called'))),
        getAllGuides: vi.fn(() => Promise.reject(new Error('port must not be called'))),
        getCollections: vi.fn(() => Promise.reject(new Error('port must not be called'))),
        getAllTopics: vi.fn(() => Promise.reject(new Error('port must not be called'))),
        getGuide: vi.fn(() => Promise.reject(new Error('port must not be called'))),
      }
      const query = new GetGuideQuery(guardedPort)

      await expect(query.execute({ topic: '   ' })).rejects.toBeInstanceOf(GuideTopicNotFoundError)
      expect(guardedPort.getGuide).not.toHaveBeenCalled()
      expect(guardedPort.getAllTopics).not.toHaveBeenCalled()
      expect(guardedPort.getCollections).not.toHaveBeenCalled()
    })

    it('returns guide topic by exact, case-insensitive, or stripped .md name', async () => {
      const query = new GetGuideQuery(mockCatalogPort)
      const res1 = await query.execute({ topic: 'workflow' })
      expect(res1.topic).toBe('workflow')

      const res2 = await query.execute({ topic: 'WORKFLOW.md' })
      expect(res2.topic).toBe('workflow')

      const res3 = await query.execute({ topic: '  workflow  ' })
      expect(res3.topic).toBe('workflow')
    })

    it('does not resolve an unqualified topic across multiple collections', async () => {
      const multiCollectionPort: GuideCatalogPort = {
        ...mockCatalogPort,
        async getCollections(): Promise<readonly string[]> {
          return ['guide', 'sdk']
        },
      }
      const query = new GetGuideQuery(multiCollectionPort)

      await expect(query.execute({ topic: 'workflow' })).rejects.toBeInstanceOf(
        GuideTopicNotFoundError,
      )
    })

    it('throws GuideTopicNotFoundError when topic does not exist', async () => {
      const query = new GetGuideQuery(mockCatalogPort)
      await expect(query.execute({ topic: 'does-not-exist' })).rejects.toThrow(
        GuideTopicNotFoundError,
      )
    })

    it('offers no title suggestion when no title equals the request', async () => {
      const query = new GetGuideQuery(mockCatalogPort)
      const err = await query.execute({ topic: 'does-not-exist' }).catch((e: unknown) => e)

      expect(err).toBeInstanceOf(GuideTopicNotFoundError)
      expect((err as GuideTopicNotFoundError).titleMatches).toEqual([])
    })

    it('suggests the collection-qualified topic when the request matches a title', async () => {
      // `Getting Started` is the title of a topic whose identifier is `getting-started`,
      // so a caller who pastes the title has no topic identifier to type.
      const query = new GetGuideQuery(mockCatalogPort)
      const err = await query.execute({ topic: 'Getting Started' }).catch((e: unknown) => e)

      expect(err).toBeInstanceOf(GuideTopicNotFoundError)
      const notFound = err as GuideTopicNotFoundError
      expect(notFound.titleMatches).toEqual(['guide:getting-started'])
      expect(notFound.availableTopics[0]).toBe('guide:getting-started')
      expect(notFound.message).toContain(
        "A topic titled 'Getting Started' exists: guide:getting-started",
      )
    })

    it('matches a title ignoring case', async () => {
      const query = new GetGuideQuery(mockCatalogPort)
      const err = await query.execute({ topic: 'getting started' }).catch((e: unknown) => e)

      expect((err as GuideTopicNotFoundError).titleMatches).toEqual(['guide:getting-started'])
    })

    it('reports a title match from another collection when the request names the wrong one', async () => {
      const query = new GetGuideQuery(generatedCatalogPort)
      const err = await query.execute({ topic: 'code-graph:ArtifactDag' }).catch((e: unknown) => e)

      expect(err).toBeInstanceOf(GuideTopicNotFoundError)
      const notFound = err as GuideTopicNotFoundError
      // The request named a collection the title is not in. Naming a collection wrong is
      // the most common cause of an unknown generated topic, so the match elsewhere is
      // reported as the fix rather than suppressed to keep the search "scoped".
      expect(notFound.titleMatches).toEqual(['guide:interfaces/ArtifactDag'])
      expect(notFound.crossCollection).toBe(true)
      expect(notFound.message).toContain(
        'That title exists in another collection: guide:interfaces/ArtifactDag.',
      )
    })

    it('keeps a sibling title match out of the requested collection candidates', async () => {
      const sdkArtifactDag: GuideTopic = {
        ...sampleGuides[0]!,
        collection: 'sdk',
        topic: 'classes/ArtifactDag',
        title: 'ArtifactDag',
      }
      const coreCandidate: GuideTopic = {
        ...sampleGuides[0]!,
        collection: 'core',
        topic: 'overview',
        title: 'Core Overview',
      }
      const crossCollectionPort: GuideCatalogPort = {
        ...mockCatalogPort,
        async getCollections(): Promise<readonly string[]> {
          return ['core', 'sdk']
        },
        async getGuide(topic: string): Promise<GuideTopic | null> {
          return topic === 'sdk:classes/artifactdag' ? sdkArtifactDag : null
        },
        async getAllTopics(): Promise<readonly GuideTopic[]> {
          return [coreCandidate, sdkArtifactDag]
        },
      }
      const query = new GetGuideQuery(crossCollectionPort)

      const err = await query
        .execute({ topic: 'core:classes/ArtifactDag' })
        .catch((error: unknown) => error)

      expect(err).toBeInstanceOf(GuideTopicNotFoundError)
      const notFound = err as GuideTopicNotFoundError
      expect(notFound.availableTopics).toEqual(['core:overview'])
      expect(notFound.availableTopics).not.toContain('sdk:classes/ArtifactDag')
      expect(notFound.titleMatches).toEqual(['sdk:classes/ArtifactDag'])
      expect(notFound.crossCollection).toBe(true)
    })

    it('matches a title through the kind directory prefix', async () => {
      const query = new GetGuideQuery(generatedCatalogPort)
      const err = await query
        .execute({ topic: 'code-graph:interfaces/ArtifactDag' })
        .catch((e: unknown) => e)

      // The request is wrong twice: the collection and, implicitly, the kind directory.
      // Comparing the whole path against the title would reject it, so the last segment is
      // what must be matched. The suggestion must still name the real address.
      expect((err as GuideTopicNotFoundError).titleMatches).toEqual([
        'guide:interfaces/ArtifactDag',
      ])
      expect((err as GuideTopicNotFoundError).crossCollection).toBe(true)
    })

    it('suggests a generated API topic when the request is its symbol name', async () => {
      const query = new GetGuideQuery(generatedCatalogPort)
      const err = await query.execute({ topic: 'ArtifactDag' }).catch((e: unknown) => e)

      expect(err).toBeInstanceOf(GuideTopicNotFoundError)
      expect((err as GuideTopicNotFoundError).titleMatches).toEqual([
        'guide:interfaces/ArtifactDag',
      ])
    })

    it('resolves the suggestion back to the topic on a second lookup', async () => {
      const query = new GetGuideQuery(generatedCatalogPort)
      const err = await query.execute({ topic: 'ArtifactDag' }).catch((e: unknown) => e)
      const suggested = (err as GuideTopicNotFoundError).titleMatches[0]!

      const res = await query.execute({ topic: suggested })
      expect(res.topic).toBe('interfaces/ArtifactDag')
    })

    it('reports every title match in a stable order when titles collide', async () => {
      const duplicateTitleCatalogPort: GuideCatalogPort = {
        ...mockCatalogPort,
        async getAllTopics(): Promise<readonly GuideTopic[]> {
          return [
            ...sampleGuides,
            { ...sampleGuides[0]!, collection: 'sdk', topic: 'b-dup', title: 'Shared Title' },
            { ...sampleGuides[0]!, collection: 'sdk', topic: 'a-dup', title: 'Shared Title' },
          ]
        },
      }
      const query = new GetGuideQuery(duplicateTitleCatalogPort)
      const err = await query.execute({ topic: 'Shared Title' }).catch((e: unknown) => e)

      expect((err as GuideTopicNotFoundError).titleMatches).toEqual(['sdk:a-dup', 'sdk:b-dup'])
    })
  })

  describe('GetGuideOutlineQuery', () => {
    it('returns outline with stats and all sections', async () => {
      const query = new GetGuideOutlineQuery(mockCatalogPort)
      const outline = await query.execute({ topic: 'workflow' })
      expect(outline.topic).toBe('workflow')
      expect(outline.lines).toBe(50)
      expect(outline.sections).toHaveLength(4)
      expect(outline.sections[0]!.index).toBe(1)
      expect(outline.sections[0]).not.toHaveProperty('content')

      const section = await new GetGuideSectionQuery(mockCatalogPort).execute({
        topic: 'workflow',
        section: '1',
      })
      expect(section.content).toBe('# Introduction\nWelcome to SpecD')
    })
  })

  describe('GetGuideSectionQuery', () => {
    let query: GetGuideSectionQuery

    beforeEach(() => {
      query = new GetGuideSectionQuery(mockCatalogPort)
    })

    it('extracts unique section by heading text or slug', async () => {
      const sec1 = await query.execute({ topic: 'workflow', section: 'Lifecycle States' })
      expect(sec1.index).toBe(3)
      expect(sec1.heading).toBe('Lifecycle States')

      const sec2 = await query.execute({ topic: 'workflow', section: 'lifecycle-states' })
      expect(sec2.index).toBe(3)
    })

    it('extracts section by 1-indexed number', async () => {
      const sec = await query.execute({ topic: 'workflow', section: 3 })
      expect(sec.index).toBe(3)
      expect(sec.heading).toBe('Lifecycle States')
    })

    it('extracts section by numeric string', async () => {
      const sec = await query.execute({ topic: 'workflow', section: '3' })
      expect(sec.index).toBe(3)
    })

    it('disambiguates duplicate headings when selected by index', async () => {
      const first = await query.execute({ topic: 'workflow', section: 2 })
      expect(first.index).toBe(2)
      expect(first.startLine).toBe(11)

      const second = await query.execute({ topic: 'workflow', section: 4 })
      expect(second.index).toBe(4)
      expect(second.startLine).toBe(36)
    })

    it('throws GuideSectionAmbiguousError when duplicate heading is requested by name', async () => {
      try {
        await query.execute({ topic: 'workflow', section: 'Examples' })
        expect.unreachable('Should have thrown GuideSectionAmbiguousError')
      } catch (err) {
        expect(err).toBeInstanceOf(GuideSectionAmbiguousError)
        const amb = err as GuideSectionAmbiguousError
        expect(amb.code).toBe('AMBIGUOUS_GUIDE_SECTION')
        expect(amb.matchingIndices).toEqual([2, 4])
        expect(amb.message).toContain('Multiple sections match')
        expect(amb.message).toContain('--section 2')
        expect(amb.message).toContain('--section 4')
      }
    })

    it('throws GuideSectionNotFoundError when numeric index is out of bounds', async () => {
      await expect(query.execute({ topic: 'workflow', section: 0 })).rejects.toThrow(
        GuideSectionNotFoundError,
      )
      await expect(query.execute({ topic: 'workflow', section: 99 })).rejects.toThrow(
        GuideSectionNotFoundError,
      )
    })

    it('throws GuideSectionNotFoundError when heading name is not found', async () => {
      await expect(
        query.execute({ topic: 'workflow', section: 'Totally Unknown Section' }),
      ).rejects.toThrow(GuideSectionNotFoundError)
    })
  })

  describe('SearchGuidesQuery', () => {
    it('returns empty array when query is empty or whitespace-only', async () => {
      const query = new SearchGuidesQuery(mockSearchPort)
      const res1 = await query.execute({ query: '' })
      expect(res1).toEqual([])

      const res2 = await query.execute({ query: '   ' })
      expect(res2).toEqual([])
    })

    it('delegates valid query to search port and returns hits', async () => {
      const query = new SearchGuidesQuery(mockSearchPort)
      const hits = await query.execute({ query: 'lifecycle' })
      expect(hits).toHaveLength(1)
      expect(hits[0]!.section).toBe('Lifecycle States')
      expect(hits[0]!.readCommand).toBe('specd guide workflow --section 3')
    })
  })
})
