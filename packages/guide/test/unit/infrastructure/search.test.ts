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
      content: '# Introduction\nSpecD provides spec-driven development tooling.',
    },
    {
      index: 2,
      heading: 'Lifecycle States',
      level: 2,
      startLine: 11,
      endLine: 30,
      lines: 20,
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
      content: '# Configuring Schemas\nSchemas govern workflow transitions and artifact rules.',
    },
    {
      index: 2,
      heading: 'Standard Schema',
      level: 2,
      startLine: 26,
      endLine: 50,
      lines: 25,
      content:
        '## Standard Schema\nThe standard schema defines proposal, specs, verify, design, tasks.',
    },
  ]

  const testGuides: GuideTopic[] = [
    {
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

  it('generates line-numbered snippets around match', async () => {
    const hits = await adapter.search('drafting')
    expect(hits.length).toBeGreaterThan(0)
    const hit = hits[0]!
    expect(hit.snippet).toContain('|')
    expect(hit.snippet).toContain('drafting')
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
