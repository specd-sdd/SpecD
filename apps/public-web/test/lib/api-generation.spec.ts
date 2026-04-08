import { describe, expect, it } from 'vitest'
import { buildApiIndexContent, escapeMdxBracesInLine } from '../../scripts/generate-api-docs.mjs'
import { generatedApiPath, initialApiEntryPoints } from '../../src/lib/public-docs-config'

describe('API generation config', () => {
  it('writes generated reference output into the derived app-local directory', () => {
    expect(generatedApiPath.startsWith('.generated/')).toBe(true)
    expect(generatedApiPath).toBe('.generated/api')
  })

  it('starts from the core public entrypoint only', () => {
    expect(initialApiEntryPoints).toHaveLength(1)
    expect(initialApiEntryPoints[0]).toContain('packages/core/src/index.ts')
  })

  it('encodes prose braces so generated markdown stays MDX-safe', () => {
    expect(escapeMdxBracesInLine('Pass { force: true } to bypass validation.')).toBe(
      'Pass &#123; force: true &#125; to bypass validation.',
    )
    expect(escapeMdxBracesInLine('> **ContextEntry** = \\{ `instruction`: `string`; \\}')).toBe(
      '> **ContextEntry** = &#123; `instruction`: `string`; &#125;',
    )
  })

  it('preserves inline code while sanitizing surrounding prose', () => {
    expect(
      escapeMdxBracesInLine('Object shape \\{ value: string \\} and `const value = { ok: true }`.'),
    ).toBe('Object shape &#123; value: string &#125; and `const value = { ok: true }`.')
  })

  it('creates a synthetic overview doc for the api root route', () => {
    const content = buildApiIndexContent()

    expect(content).toContain('title: API Reference')
    expect(content).toContain('# @specd/core API Reference')
    expect(content).toContain('/api/classes/AlreadyInitialisedError')
  })
})
