import { beforeEach, describe, expect, it } from 'vitest'
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
      content: '# Introduction\nWelcome to SpecD',
    },
    {
      index: 2,
      heading: 'Examples',
      level: 2,
      startLine: 11,
      endLine: 20,
      lines: 10,
      content: '## Examples\nBasic examples',
    },
    {
      index: 3,
      heading: 'Lifecycle States',
      level: 2,
      startLine: 21,
      endLine: 35,
      lines: 15,
      content: '## Lifecycle States\nStates details',
    },
    {
      index: 4,
      heading: 'Examples',
      level: 2,
      startLine: 36,
      endLine: 50,
      lines: 15,
      content: '## Examples\nAdvanced examples',
    },
  ]

  const sampleGuides: GuideTopic[] = [
    {
      topic: 'workflow',
      title: 'Change Lifecycle Guide',
      description: 'Workflow details',
      order: 2,
      content: 'Sample content workflow',
      lineCount: 50,
      byteLength: 200,
      outline: sampleSections,
    },
    {
      topic: 'getting-started',
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
      return sampleGuides.find((g) => g.topic === normalized) ?? null
    },
    async getAllGuides(): Promise<readonly GuideTopic[]> {
      return sampleGuides
    },
  }

  const mockSearchPort: GuideSearchPort = {
    async search(query: string, options?: GuideSearchOptions): Promise<readonly GuideSearchHit[]> {
      if (!query.trim()) return []
      return [
        {
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
      const list = await query.execute()
      expect(list).toHaveLength(2)
      expect(list[0]!.topic).toBe('getting-started')
      expect(list[1]!.topic).toBe('workflow')
    })
  })

  describe('GetGuideQuery', () => {
    it('returns guide topic by exact, case-insensitive, or stripped .md name', async () => {
      const query = new GetGuideQuery(mockCatalogPort)
      const res1 = await query.execute({ topic: 'workflow' })
      expect(res1.topic).toBe('workflow')

      const res2 = await query.execute({ topic: 'WORKFLOW.md' })
      expect(res2.topic).toBe('workflow')

      const res3 = await query.execute({ topic: '  workflow  ' })
      expect(res3.topic).toBe('workflow')
    })

    it('throws GuideTopicNotFoundError when topic does not exist', async () => {
      const query = new GetGuideQuery(mockCatalogPort)
      await expect(query.execute({ topic: 'does-not-exist' })).rejects.toThrow(
        GuideTopicNotFoundError,
      )
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
        expect(amb.message).toContain('--section <number>')
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
