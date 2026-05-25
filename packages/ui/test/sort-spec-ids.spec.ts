import { describe, expect, it } from 'vitest'
import { sortSpecIds } from '../src/lib/sort-spec-ids.js'

describe('sortSpecIds', () => {
  it('sorts qualified spec ids ascending with localeCompare', () => {
    expect(sortSpecIds(['ui:shell-layout', 'core:change', 'api:routes-graph'])).toEqual([
      'api:routes-graph',
      'core:change',
      'ui:shell-layout',
    ])
  })

  it('does not mutate the input array', () => {
    const input = ['b', 'a']
    const sorted = sortSpecIds(input)
    expect(input).toEqual(['b', 'a'])
    expect(sorted).toEqual(['a', 'b'])
  })
})
