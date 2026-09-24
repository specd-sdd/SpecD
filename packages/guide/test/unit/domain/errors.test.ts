import { describe, expect, it } from 'vitest'
import {
  GuideSectionAmbiguousError,
  GuideSectionNotFoundError,
  GuideTopicNotFoundError,
  SpecdGuideError,
} from '../../../src/domain/errors/index.js'

describe('Domain Errors Hierarchy', () => {
  class DummyGuideError extends SpecdGuideError {
    readonly code = 'DUMMY_ERROR'
  }

  it('SpecdGuideError satisfies duck-typed SpecD Error Contract', () => {
    const error = new DummyGuideError('Something failed')
    expect(error).toBeInstanceOf(Error)
    expect(error.specd).toBe(true)
    expect(error.code).toBe('DUMMY_ERROR')
    expect(error.name).toBe('DummyGuideError')
    expect(error.stack).toBeDefined()
  })

  it('GuideTopicNotFoundError includes topic, availableTopics, and helpful message', () => {
    const error = new GuideTopicNotFoundError('unknown-topic', ['workflow', 'schemas'])
    expect(error).toBeInstanceOf(SpecdGuideError)
    expect(error.code).toBe('UNKNOWN_GUIDE_TOPIC')
    expect(error.topic).toBe('unknown-topic')
    expect(error.availableTopics).toEqual(['workflow', 'schemas'])
    expect(error.message).toContain("'unknown-topic'")
    expect(error.message).toContain('workflow, schemas')
  })

  it('GuideTopicNotFoundError handles empty topic and strange characters', () => {
    const error = new GuideTopicNotFoundError('../../etc/passwd', ['workflow'])
    expect(error.topic).toBe('../../etc/passwd')
    expect(error.message).toContain('../../etc/passwd')
  })

  it('GuideSectionNotFoundError includes heading, availableHeadings, and helpful message', () => {
    const error = new GuideSectionNotFoundError('Nonexistent', ['[1] Intro', '[2] Details'])
    expect(error).toBeInstanceOf(SpecdGuideError)
    expect(error.code).toBe('UNKNOWN_GUIDE_SECTION')
    expect(error.heading).toBe('Nonexistent')
    expect(error.availableHeadings).toEqual(['[1] Intro', '[2] Details'])
    expect(error.message).toContain("'Nonexistent'")
    expect(error.message).toContain('[1] Intro')
  })

  it('GuideSectionAmbiguousError populates matchingIndices, matchingHeadings and guides disambiguation', () => {
    const error = new GuideSectionAmbiguousError(
      'Examples',
      [2, 6],
      ['[2] Examples (lines 20-35)', '[6] Examples (lines 140-160)'],
    )
    expect(error).toBeInstanceOf(SpecdGuideError)
    expect(error.code).toBe('AMBIGUOUS_GUIDE_SECTION')
    expect(error.heading).toBe('Examples')
    expect(error.matchingIndices).toEqual([2, 6])
    expect(error.matchingHeadings).toHaveLength(2)
    expect(error.message).toContain("Multiple sections match 'Examples'")
    expect(error.message).toContain('[2] Examples (lines 20-35)')
    expect(error.message).toContain('[6] Examples (lines 140-160)')
    expect(error.message).toContain('Use --section <number> to disambiguate.')
  })

  it('Preserves Error.name across all concrete subtypes', () => {
    expect(new GuideTopicNotFoundError('t', []).name).toBe('GuideTopicNotFoundError')
    expect(new GuideSectionNotFoundError('s', []).name).toBe('GuideSectionNotFoundError')
    expect(new GuideSectionAmbiguousError('s', [], []).name).toBe('GuideSectionAmbiguousError')
  })
})
