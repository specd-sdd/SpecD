import { describe, it, expect } from 'vitest'
import { expandSymbolName } from '../../../src/domain/services/expand-symbol-name.js'

describe('expandSymbolName', () => {
  it('splits camelCase', () => {
    expect(expandSymbolName('handleError')).toBe('handleError handle error')
  })

  it('splits PascalCase', () => {
    expect(expandSymbolName('ChangeState')).toBe('ChangeState change state')
  })

  it('splits uppercase acronyms followed by lowercase', () => {
    expect(expandSymbolName('XMLParser')).toBe('XMLParser xml parser')
  })

  it('splits consecutive acronyms', () => {
    expect(expandSymbolName('getHTTPSUrl')).toBe('getHTTPSUrl get https url')
  })

  it('splits snake_case', () => {
    expect(expandSymbolName('is_valid_name')).toBe('is_valid_name is valid name')
  })

  it('splits kebab-case', () => {
    expect(expandSymbolName('my-component')).toBe('my-component my component')
  })

  it('splits mixed camelCase with acronym', () => {
    expect(expandSymbolName('parseSpecId')).toBe('parseSpecId parse spec id')
  })

  it('returns original for single lowercase word', () => {
    expect(expandSymbolName('output')).toBe('output')
  })

  it('returns original for single uppercase word', () => {
    expect(expandSymbolName('OUTPUT')).toBe('OUTPUT')
  })

  it('handles single character name', () => {
    expect(expandSymbolName('x')).toBe('x')
  })

  it('splits complex real-world names', () => {
    expect(expandSymbolName('resolveCliContext')).toBe('resolveCliContext resolve cli context')
  })

  it('splits names starting with is-prefix', () => {
    expect(expandSymbolName('isSpecdConfig')).toBe('isSpecdConfig is specd config')
  })

  it('splits names with leading uppercase', () => {
    expect(expandSymbolName('CodeGraphProvider')).toBe('CodeGraphProvider code graph provider')
  })

  it('splits mixed camelCase, kebab-case, and snake_case', () => {
    expect(expandSymbolName('handleError-code_test')).toBe(
      'handleError-code_test handle error code test',
    )
  })
})
