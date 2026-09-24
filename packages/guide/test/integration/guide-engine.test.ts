import { describe, expect, it } from 'vitest'
import {
  createGuideEngine,
  GuideSectionNotFoundError,
  GuideTopicNotFoundError,
} from '../../src/index.js'

describe('GuideEngine Integration Tests', () => {
  const engine = createGuideEngine()

  it('lists all 12 prebundled guides in order', async () => {
    const list = await engine.listGuides()
    expect(list.length).toBeGreaterThanOrEqual(12)

    // Ensure strictly ordered by order ascending
    for (let i = 1; i < list.length; i++) {
      expect(list[i]!.order).toBeGreaterThanOrEqual(list[i - 1]!.order)
    }

    const topics = list.map((g) => g.topic)
    expect(topics).toContain('getting-started')
    expect(topics).toContain('workflow')
    expect(topics).toContain('cli')
    expect(topics).toContain('configuration')
    expect(topics).toContain('workspaces')
    expect(topics).toContain('schemas')
    expect(topics).toContain('selectors')
    expect(topics).toContain('artifacts')
    expect(topics).toContain('deltas')
    expect(topics).toContain('code-graph')
    expect(topics).toContain('standard-schema')
    expect(topics).toContain('custom-schemas')
  })

  it('retrieves guide topic content by name and normalized name', async () => {
    const guide1 = await engine.getGuide('workflow')
    expect(guide1.topic).toBe('workflow')
    expect(guide1.title).toBe('Change Lifecycle Guide')
    expect(guide1.lineCount).toBeGreaterThan(50)
    expect(guide1.byteLength).toBeGreaterThan(1000)

    const guide2 = await engine.getGuide('WORKFLOW.md')
    expect(guide2.topic).toBe('workflow')
  })

  it('throws GuideTopicNotFoundError for non-existent guide', async () => {
    await expect(engine.getGuide('non-existent')).rejects.toThrow(GuideTopicNotFoundError)
  })

  it('retrieves outline with section indices and line coordinates', async () => {
    const outline = await engine.getGuideOutline('workflow')
    expect(outline.topic).toBe('workflow')
    expect(outline.file).toBe('workflow.md')
    expect(outline.sections.length).toBeGreaterThan(5)

    // Verify sections have sequential 1-indexed index
    outline.sections.forEach((sec, idx) => {
      expect(sec.index).toBe(idx + 1)
      expect(sec.startLine).toBeGreaterThan(0)
      expect(sec.endLine).toBeGreaterThanOrEqual(sec.startLine)
      expect(sec.lines).toBe(sec.endLine - sec.startLine + 1)
    })
  })

  it('retrieves section by 1-indexed section number', async () => {
    const sec1 = await engine.getGuideSection('workflow', 1)
    expect(sec1.index).toBe(1)
    expect(sec1.level).toBe(1)
    expect(sec1.heading).toBe('Change Lifecycle Guide')

    const sec2 = await engine.getGuideSection('workflow', 2)
    expect(sec2.index).toBe(2)
  })

  it('retrieves section by heading text and slug', async () => {
    const sec = await engine.getGuideSection('workflow', 'How the pieces fit together')
    expect(sec.heading).toBe('How the pieces fit together')

    const secSlug = await engine.getGuideSection('workflow', 'how-the-pieces-fit-together')
    expect(secSlug.heading).toBe('How the pieces fit together')
  })

  it('slices lines with line numbers correctly', () => {
    const raw = 'Alpha\nBeta\nGamma'
    const sliced = engine.sliceGuideLines(raw, 2, 2)
    expect(sliced).toBe('Beta\nGamma')

    const numbered = engine.formatWithLineNumbers(sliced, 2)
    expect(numbered).toBe('2 | Beta\n3 | Gamma')
  })

  it('executes full-text search across all guides and returns ranked hits', async () => {
    const hits = await engine.searchGuides('lifecycle')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]!.topic).toBeDefined()
    expect(hits[0]!.section).toBeDefined()
    expect(hits[0]!.sectionIndex).toBeGreaterThan(0)
    expect(hits[0]!.readCommand).toMatch(/specd guide [a-z0-9-]+ --section \d+/)
    expect(hits[0]!.snippet).toContain('|')
  })

  it('scopes search by topic and limit', async () => {
    const hits = await engine.searchGuides('spec', { topic: 'schemas', limit: 2 })
    expect(hits.length).toBeLessThanOrEqual(2)
    for (const hit of hits) {
      expect(hit.topic).toBe('schemas')
    }
  })
})
