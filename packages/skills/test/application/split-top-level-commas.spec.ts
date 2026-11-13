import { describe, expect, it } from 'vitest'
import { splitTopLevelCommas } from '../../src/application/split-top-level-commas.js'

describe('splitTopLevelCommas', () => {
  it('given a flat list, when split, then entries are trimmed', () => {
    expect(splitTopLevelCommas('Read, Write ,Edit')).toEqual(['Read', 'Write', 'Edit'])
  })

  it('given commas inside parentheses, when split, then they do not split', () => {
    expect(splitTopLevelCommas('Bash(a, b), Read')).toEqual(['Bash(a, b)', 'Read'])
  })

  it('given empty entries, when split, then they are dropped', () => {
    expect(splitTopLevelCommas(' , Read,, ')).toEqual(['Read'])
  })

  it('given an unbalanced closing parenthesis, when split, then depth does not go negative', () => {
    expect(splitTopLevelCommas('a), b')).toEqual(['a)', 'b'])
  })
})
