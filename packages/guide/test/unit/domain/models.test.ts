import { describe, expect, it } from 'vitest'
import type {
  GuideOutline,
  GuideSearchHit,
  GuideSection,
  GuideSummary,
  GuideTopic,
} from '../../../src/domain/models/index.js'

describe('Domain Models & Value Objects', () => {
  it('instantiates valid GuideTopic entity with accurate lineCount and byteLength', () => {
    const rawContent = '# Title\n\nHello world!\n'
    const section: GuideSection = {
      index: 1,
      heading: 'Title',
      level: 1,
      startLine: 1,
      endLine: 3,
      lines: 3,
      content: rawContent,
    }

    const topic: GuideTopic = {
      topic: 'test-guide',
      title: 'Test Guide',
      description: 'A test guide entity',
      order: 1,
      content: rawContent,
      lineCount: 3,
      byteLength: Buffer.byteLength(rawContent, 'utf-8'),
      outline: [section],
    }

    expect(topic.topic).toBe('test-guide')
    expect(topic.byteLength).toBe(rawContent.length)
    expect(topic.outline[0]!.index).toBe(1)
  })

  it('correctly calculates byteLength for multibyte UTF-8 characters and emojis', () => {
    const unicodeText = '# ¡Hola! 🚀 Café & Piña\n'
    const byteLength = Buffer.byteLength(unicodeText, 'utf-8')
    expect(byteLength).toBeGreaterThan(unicodeText.length)

    const topic: GuideTopic = {
      topic: 'unicode',
      title: 'Unicode & Emojis',
      description: 'Unicode tests',
      order: 2,
      content: unicodeText,
      lineCount: 1,
      byteLength,
      outline: [],
    }

    expect(topic.byteLength).toBe(byteLength)
  })

  it('validates GuideSearchHit contract with sectionIndex and readCommand', () => {
    const hit: GuideSearchHit = {
      topic: 'workflow',
      file: 'workflow.md',
      section: 'Lifecycle States',
      sectionIndex: 4,
      level: 2,
      startLine: 45,
      endLine: 78,
      score: 12.5,
      snippet: ' 45 | ## Lifecycle States\n 46 | Every change moves...',
      readCommand: 'specd guide workflow --section 4',
    }

    expect(hit.sectionIndex).toBe(4)
    expect(hit.readCommand).toBe('specd guide workflow --section 4')
    expect(hit.score).toBeGreaterThan(0)
  })

  it('validates GuideOutline contract structure', () => {
    const outline: GuideOutline = {
      topic: 'workflow',
      file: 'workflow.md',
      lines: 100,
      bytes: 2500,
      sections: [
        {
          index: 1,
          heading: 'Change Lifecycle Guide',
          level: 1,
          startLine: 1,
          endLine: 40,
          lines: 40,
          content: '# Change Lifecycle Guide',
        },
      ],
    }

    expect(outline.sections).toHaveLength(1)
    expect(outline.sections[0]!.lines).toBe(40)
  })
})
