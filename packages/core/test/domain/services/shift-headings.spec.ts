import { describe, it, expect } from 'vitest'
import { shiftHeadings } from '../../../src/domain/services/shift-headings.js'

describe('shiftHeadings', () => {
  it('shifts headings deeper by positive delta', () => {
    const input = '# Title\n\n## Section\n\nSome text\n\n### Sub'
    const result = shiftHeadings(input, 1)
    expect(result).toBe('## Title\n\n### Section\n\nSome text\n\n#### Sub')
  })

  it('shifts headings shallower by negative delta', () => {
    const input = '### Deep\n\n#### Deeper'
    const result = shiftHeadings(input, -1)
    expect(result).toBe('## Deep\n\n### Deeper')
  })

  it('clamps heading levels to minimum 1', () => {
    const input = '## Heading'
    const result = shiftHeadings(input, -5)
    expect(result).toBe('# Heading')
  })

  it('clamps heading levels to maximum 6', () => {
    const input = '##### Heading'
    const result = shiftHeadings(input, 5)
    expect(result).toBe('###### Heading')
  })

  it('returns input unchanged when delta is 0', () => {
    const input = '# Title\n\n## Section'
    expect(shiftHeadings(input, 0)).toBe(input)
  })

  it('does not modify headings inside fenced code blocks', () => {
    const input = 'Before\n\n```\n# Not a heading\n## Also not\n```\n\n# Real heading'
    const result = shiftHeadings(input, 1)
    expect(result).toBe('Before\n\n```\n# Not a heading\n## Also not\n```\n\n## Real heading')
  })

  it('handles code blocks with language specifier', () => {
    const input = '```markdown\n# Inside code\n```\n\n# Outside'
    const result = shiftHeadings(input, 1)
    expect(result).toBe('```markdown\n# Inside code\n```\n\n## Outside')
  })

  it('preserves non-heading lines', () => {
    const input = 'Plain text\n\n- list item\n\n> blockquote\n\n# Heading'
    const result = shiftHeadings(input, 1)
    expect(result).toBe('Plain text\n\n- list item\n\n> blockquote\n\n## Heading')
  })

  it('does not match lines with only hashes and no space', () => {
    const input = '### Valid heading\n\n###NotAHeading'
    const result = shiftHeadings(input, 1)
    expect(result).toBe('#### Valid heading\n\n###NotAHeading')
  })
})
