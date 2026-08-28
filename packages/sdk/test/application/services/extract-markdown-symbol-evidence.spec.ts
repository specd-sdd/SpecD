import { describe, it, expect } from 'vitest'
import {
  extractMarkdownSymbolEvidence,
  type ExtractMarkdownSymbolEvidenceInput,
} from '../../../src/application/services/extract-markdown-symbol-evidence.js'

describe('extractMarkdownSymbolEvidence', () => {
  const defaultInput: Omit<ExtractMarkdownSymbolEvidenceInput, 'markdown'> = {
    supportedExtensions: new Set(['.ts', '.js', '.go', '.py', '.rs']),
    supportedLanguages: new Set(['typescript', 'ts', 'javascript', 'js', 'go', 'python', 'rust']),
    reservedKeywords: new Set([
      'const',
      'let',
      'var',
      'function',
      'class',
      'interface',
      'import',
      'export',
    ]),
  }

  it('returns empty array for empty markdown', () => {
    const result = extractMarkdownSymbolEvidence({
      ...defaultInput,
      markdown: '',
    })
    expect(result).toEqual([])
  })

  it('tracks heading section paths correctly across nested depths', () => {
    const markdown = `
# Level 1 Spec
Some prose here with AlphaService.

## Level 2 Requirements
### Level 3 Detail
\`\`\`typescript
class BetaWorker {}
\`\`\`
## Level 2 Another Section
\`GammaRepository\`
`
    const result = extractMarkdownSymbolEvidence({
      ...defaultInput,
      markdown,
    })

    const alpha = result.find((e) => e.candidate === 'AlphaService')
    expect(alpha).toBeDefined()
    expect(alpha?.sectionPath).toEqual(['Level 1 Spec'])

    const beta = result.find((e) => e.candidate === 'BetaWorker')
    expect(beta).toBeDefined()
    expect(beta?.sectionPath).toEqual(['Level 1 Spec', 'Level 2 Requirements', 'Level 3 Detail'])

    const gamma = result.find((e) => e.candidate === 'GammaRepository')
    expect(gamma).toBeDefined()
    expect(gamma?.sectionPath).toEqual(['Level 1 Spec', 'Level 2 Another Section'])
  })

  it('ignores fenced code blocks with unsupported languages', () => {
    const markdown = `
\`\`\`unknownlang
class ShouldBeIgnored {}
\`\`\`

\`\`\`typescript
class ShouldBeIncluded {}
\`\`\`
`
    const result = extractMarkdownSymbolEvidence({
      ...defaultInput,
      markdown,
    })

    expect(result.some((e) => e.candidate === 'ShouldBeIgnored')).toBe(false)
    expect(result.some((e) => e.candidate === 'ShouldBeIncluded')).toBe(true)
  })

  it('extracts multi-language inline file paths based on supported extensions', () => {
    const markdown = `
See \`src/domain/user.ts\` and \`pkg/service/auth.go\` along with \`scripts/deploy.sh\`.
`
    const result = extractMarkdownSymbolEvidence({
      ...defaultInput,
      markdown,
    })

    const filePaths = result.filter((e) => e.kind === 'file-path').map((e) => e.candidate)
    expect(filePaths).toContain('src/domain/user.ts')
    expect(filePaths).toContain('pkg/service/auth.go')
    expect(filePaths).not.toContain('scripts/deploy.sh') // .sh is not in supportedExtensions
  })

  it('filters reserved language keywords and universal prose stop words', () => {
    const markdown = `
\`\`\`typescript
const interface = 123
class MyValidSymbol {}
\`\`\`

Given when then must shall should output result ErrorMessage.
`
    const result = extractMarkdownSymbolEvidence({
      ...defaultInput,
      markdown,
    })

    const candidates = result.map((e) => e.candidate.toLowerCase())
    expect(candidates).not.toContain('const')
    expect(candidates).not.toContain('interface')
    expect(candidates).not.toContain('given')
    expect(candidates).not.toContain('when')
    expect(candidates).not.toContain('then')
    expect(candidates).not.toContain('must')

    expect(result.some((e) => e.candidate === 'MyValidSymbol')).toBe(true)
    expect(result.some((e) => e.candidate === 'ErrorMessage')).toBe(true)
  })

  it('applies source precedence (fenced-code > inline-code > prose)', () => {
    const markdown = `
In prose we mention CommonSymbol first.
Then in inline code \`CommonSymbol\` is mentioned.
Finally in fenced code:
\`\`\`typescript
class CommonSymbol {}
\`\`\`
`
    const result = extractMarkdownSymbolEvidence({
      ...defaultInput,
      markdown,
    })

    const common = result.filter((e) => e.candidate === 'CommonSymbol')
    expect(common).toHaveLength(1)
    expect(common[0]?.source).toBe('fenced-code')
  })

  it('applies source precedence (inline-code > prose)', () => {
    const markdown = `
Prose mentions SecondSymbol.
Then inline mentions \`SecondSymbol\`.
`
    const result = extractMarkdownSymbolEvidence({
      ...defaultInput,
      markdown,
    })

    const second = result.filter((e) => e.candidate === 'SecondSymbol')
    expect(second).toHaveLength(1)
    expect(second[0]?.source).toBe('inline-code')
  })

  it('preserves first appearance order for distinct candidates', () => {
    const markdown = `
FirstCandidate
SecondCandidate
ThirdCandidate
`
    const result = extractMarkdownSymbolEvidence({
      ...defaultInput,
      markdown,
    })

    const candidates = result.map((e) => e.candidate)
    expect(candidates).toEqual(['FirstCandidate', 'SecondCandidate', 'ThirdCandidate'])
  })
})
