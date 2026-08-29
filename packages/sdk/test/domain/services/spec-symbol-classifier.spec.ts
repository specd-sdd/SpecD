import { describe, it, expect } from 'vitest'
import { SpecSymbolClassifier } from '../../../src/domain/services/spec-symbol-classifier.js'

describe('SpecSymbolClassifier', () => {
  const sampleSpec = `
# core:create-change

## Purpose

Creates a new change in the project.

## Requirements

### Requirement: Use Case Interface

\`\`\`typescript
export interface CreateChangeInput {
  readonly name: string
}

export interface CreateChangeResult {
  readonly result: 'ok'
}

export class CreateChange {
  constructor(
    private readonly changeRepository: ChangeRepository,
    private readonly logger: Logger,
  ) {}

  async execute(input: CreateChangeInput): Promise<CreateChangeResult>
}
\`\`\`

## Spec Dependencies

- [\`core:change-repository\`](../change-repository/spec.md) — Persists changes
`

  it('partitions primary class and I/O structs into owned symbols', () => {
    const classified = SpecSymbolClassifier.classify(
      sampleSpec,
      'core:create-change',
      ['CreateChange'],
      ['packages/core/src/application/use-cases/create-change.ts'],
    )

    expect(classified.ownedSymbols).toContain('CreateChange')
    expect(classified.ownedSymbols).toContain('CreateChangeInput')
    expect(classified.ownedSymbols).toContain('CreateChangeResult')
    expect(classified.primaryOwnerSymbol).toBe('CreateChange')
  })

  it('partitions constructor parameters into referenced symbols', () => {
    const classified = SpecSymbolClassifier.classify(
      sampleSpec,
      'core:create-change',
      ['CreateChange'],
      ['packages/core/src/application/use-cases/create-change.ts'],
    )

    expect(classified.referencedSymbols).toContain('ChangeRepository')
    expect(classified.referencedSymbols).toContain('Logger')
    expect(classified.ownedSymbols).not.toContain('ChangeRepository')
  })

  it('detects incomplete links when primary owner symbol is missing from linked symbols', () => {
    const classified = SpecSymbolClassifier.classify(
      sampleSpec,
      'core:create-change',
      ['ChangeRepository'], // Only referenced symbol linked
      ['packages/core/src/domain/ports/change-repository.ts'],
    )

    expect(classified.isComplete).toBe(false)
    expect(classified.completenessIssues.some((issue) => issue.includes('CreateChange'))).toBe(true)
  })

  it('detects incomplete links when no files are linked', () => {
    const classified = SpecSymbolClassifier.classify(sampleSpec, 'core:create-change', [], [])

    expect(classified.isComplete).toBe(false)
    expect(classified.completenessIssues).toContain('Spec has no implementation file links')
  })

  it('marks complete when primary owner symbol and files are linked', () => {
    const classified = SpecSymbolClassifier.classify(
      sampleSpec,
      'core:create-change',
      ['CreateChange', 'CreateChangeInput'],
      ['packages/core/src/application/use-cases/create-change.ts'],
    )

    expect(classified.isComplete).toBe(true)
    expect(classified.completenessIssues).toEqual([])
  })
})
