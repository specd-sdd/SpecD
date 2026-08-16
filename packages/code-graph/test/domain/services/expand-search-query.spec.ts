import { describe, expect, it } from 'vitest'
import {
  expandSearchQuery,
  expandSearchToken,
} from '../../../src/domain/services/expand-search-query.js'

describe('expandSearchQuery', () => {
  it('preserves normalized whitespace terms while expanding original CamelCase', () => {
    expect(expandSearchQuery('  analyzeFileImpact   Change  ')).toEqual({
      normalizedQuery: 'analyzefileimpact change',
      rawTokens: ['analyzefileimpact', 'change'],
      expandedTokens: ['analyzefileimpact', 'analyze', 'file', 'impact', 'change'],
    })
  })

  it('expands separators and digits deterministically without duplicate terms', () => {
    expect(expandSearchToken('code-graph:HTTP2Adapter')).toEqual([
      'code-graph:http2adapter',
      'code',
      'graph',
      'http',
      '2',
      'adapter',
    ])
  })

  it('returns an empty plan for whitespace-only input', () => {
    expect(expandSearchQuery('   ')).toEqual({
      normalizedQuery: '',
      rawTokens: [],
      expandedTokens: [],
    })
  })
})
