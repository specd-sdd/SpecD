import { describe, expect, it } from 'vitest'
import { expandGuideTerms } from '../../../src/domain/services/expand-guide-terms.js'

describe('expandGuideTerms', () => {
  it('keeps the joined form alongside the words of a PascalCase identifier', () => {
    expect(expandGuideTerms('FreshnessLatches')).toEqual([
      'freshnesslatches',
      'freshness',
      'latches',
    ])
    expect(expandGuideTerms('ArtifactDag')).toEqual(['artifactdag', 'artifact', 'dag'])
  })

  it('keeps the joined form alongside the words of a camelCase identifier', () => {
    expect(expandGuideTerms('handleError')).toEqual(['handleerror', 'handle', 'error'])
    expect(expandGuideTerms('resolveTopicRef')).toEqual([
      'resolvetopicref',
      'resolve',
      'topic',
      'ref',
    ])
  })

  it('leaves an already-lowercase identifier as a single term', () => {
    expect(expandGuideTerms('freshnesslatches')).toEqual(['freshnesslatches'])
  })

  it('keeps a lowercased query able to reach a document titled with the exact name', () => {
    // The indexed title contributes the joined form, so a caller who types the symbol in
    // lowercase still matches. Without the joined form this would be a miss.
    const indexed = expandGuideTerms('FreshnessLatches')
    const queried = expandGuideTerms('freshnesslatches')
    expect(indexed).toContain('freshnesslatches')
    expect(queried).toContain('freshnesslatches')
  })

  it('lets prose naming the symbol in words reach the document', () => {
    expect(expandGuideTerms('freshness latches')).toEqual(['freshness', 'latches'])
  })

  it('splits acronym runs from the following capitalized word', () => {
    expect(expandGuideTerms('XMLParser')).toEqual(['xmlparser', 'xml', 'parser'])
    expect(expandGuideTerms('parseXMLDocument')).toEqual([
      'parsexmldocument',
      'parse',
      'xml',
      'document',
    ])
  })

  it('splits letter and digit boundaries', () => {
    expect(expandGuideTerms('http2')).toEqual(['http2', 'http', '2'])
    expect(expandGuideTerms('sha256Hash')).toEqual(['sha256hash', 'sha', '256', 'hash'])
  })

  it('treats separators and punctuation as term boundaries', () => {
    expect(expandGuideTerms('code-graph:interfaces/FreshnessLatches')).toEqual([
      'code',
      'graph',
      'interfaces',
      'freshnesslatches',
      'freshness',
      'latches',
    ])
    expect(expandGuideTerms('snake_case_name')).toEqual(['snake', 'case', 'name'])
    expect(expandGuideTerms('kebab-case-name')).toEqual(['kebab', 'case', 'name'])
  })

  it('lowercases terms regardless of input casing', () => {
    expect(expandGuideTerms('SPECD CLI')).toEqual(['specd', 'cli'])
  })

  it('drops empty terms produced by punctuation runs', () => {
    expect(expandGuideTerms('  ---  ')).toEqual([])
    expect(expandGuideTerms('!@#$%^&*()_+')).toEqual([])
  })

  it('removes duplicates while preserving first-seen order', () => {
    expect(expandGuideTerms('Graph graph graph-code')).toEqual(['graph', 'code'])
  })

  it('emits no duplicate when a word equals the joined form', () => {
    expect(expandGuideTerms('SDK')).toEqual(['sdk'])
  })
})
