import { describe, it, expect } from 'vitest'
import { extractSpecSummary } from '../../../src/domain/services/spec-summary.js'

describe('extractSpecSummary', () => {
  it('extracts the first paragraph after H1', () => {
    const content = '# My Spec\n\nThis is a summary.\n\n## Details\n'
    expect(extractSpecSummary(content)).toBe('This is a summary.')
  })

  it('joins multi-line paragraphs after H1 into one line', () => {
    const content = '# My Spec\n\nLine one.\nLine two.\n\n## Details\n'
    expect(extractSpecSummary(content)).toBe('Line one. Line two.')
  })

  it('skips blank lines between H1 and first paragraph', () => {
    const content = '# My Spec\n\n\n\nThe summary here.\n'
    expect(extractSpecSummary(content)).toBe('The summary here.')
  })

  it('falls back to Overview section when no paragraph after H1', () => {
    const content = '# My Spec\n\n## Overview\n\nOverview text.\n'
    expect(extractSpecSummary(content)).toBe('Overview text.')
  })

  it('falls back to Summary section', () => {
    const content = '# My Spec\n\n## Summary\n\nSummary text.\n'
    expect(extractSpecSummary(content)).toBe('Summary text.')
  })

  it('falls back to Purpose section', () => {
    const content = '# My Spec\n\n## Purpose\n\nPurpose text.\n'
    expect(extractSpecSummary(content)).toBe('Purpose text.')
  })

  it('returns null when no summary can be extracted', () => {
    expect(extractSpecSummary('')).toBeNull()
  })

  it('returns null when only headings exist', () => {
    const content = '# Title\n## Section\n## Another\n'
    expect(extractSpecSummary(content)).toBeNull()
  })

  it('does not extract from non-matching H2 sections', () => {
    const content = '# Title\n## Requirements\n\nSome text.\n'
    // H1 is followed by H2 immediately (no paragraph), and Requirements is not a matching section
    expect(extractSpecSummary(content)).toBeNull()
  })

  it('prefers H1 paragraph over Overview section', () => {
    const content = '# My Spec\n\nH1 summary.\n\n## Overview\n\nOverview text.\n'
    expect(extractSpecSummary(content)).toBe('H1 summary.')
  })
})
