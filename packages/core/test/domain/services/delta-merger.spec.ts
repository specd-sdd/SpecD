import { describe, it, expect } from 'vitest'
import { mergeSpecs, type DeltaConfig } from '../../../src/domain/services/delta-merger.js'
import { DeltaConflictError } from '../../../src/domain/errors/delta-conflict-error.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'

const path = SpecPath.parse('auth/oauth')

const reqConfig: DeltaConfig = {
  section: 'Requirements',
  pattern: '### Requirement: {name}',
}

const scenarioConfig: DeltaConfig = {
  section: 'Scenarios',
  pattern: '### Scenario: {name}',
}

function makeSpec(content: string): Spec {
  return new Spec(path, content)
}

const baseSpec = makeSpec(
  '## Requirements\n\n' +
  '### Requirement: Token expiry\nTokens must expire after 24h\n\n' +
  '### Requirement: Refresh tokens\nRefresh tokens must be stored encrypted',
)

describe('mergeSpecs', () => {
  describe('no delta', () => {
    it('returns base spec unchanged when delta has no matching sections', () => {
      const delta = makeSpec('')
      const result = mergeSpecs(baseSpec, delta, [reqConfig])
      expect(result.section('Requirements')).toBe(baseSpec.section('Requirements'))
    })

    it('preserves the base path', () => {
      const result = mergeSpecs(baseSpec, makeSpec(''), [reqConfig])
      expect(result.path.equals(path)).toBe(true)
    })

    it('preserves sections not covered by any deltaConfig', () => {
      const base = makeSpec('## Requirements\ncontent\n\n## Overview\noverview content')
      const delta = makeSpec('## ADDED Requirements\n### Requirement: New\nnew req')
      const result = mergeSpecs(base, delta, [reqConfig])
      expect(result.section('Overview')).toBe('overview content')
    })
  })

  describe('ADDED', () => {
    it('adds a new block to an existing section', () => {
      const delta = makeSpec(
        '## ADDED Requirements\n### Requirement: Token rotation\nTokens must be rotated every 24h',
      )
      const result = mergeSpecs(baseSpec, delta, [reqConfig])
      expect(result.section('Requirements')).toContain('### Requirement: Token rotation')
      expect(result.section('Requirements')).toContain('Tokens must be rotated every 24h')
    })

    it('preserves existing blocks when adding', () => {
      const delta = makeSpec(
        '## ADDED Requirements\n### Requirement: Token rotation\nnew content',
      )
      const result = mergeSpecs(baseSpec, delta, [reqConfig])
      expect(result.section('Requirements')).toContain('### Requirement: Token expiry')
      expect(result.section('Requirements')).toContain('### Requirement: Refresh tokens')
    })

    it('creates the section if it does not exist in base', () => {
      const base = makeSpec('## Overview\nsome overview')
      const delta = makeSpec(
        '## ADDED Requirements\n### Requirement: First req\ncontent',
      )
      const result = mergeSpecs(base, delta, [reqConfig])
      expect(result.section('Requirements')).toContain('### Requirement: First req')
    })
  })

  describe('MODIFIED', () => {
    it('replaces an existing block', () => {
      const delta = makeSpec(
        '## MODIFIED Requirements\n### Requirement: Token expiry\nTokens must expire after 1h',
      )
      const result = mergeSpecs(baseSpec, delta, [reqConfig])
      expect(result.section('Requirements')).toContain('Tokens must expire after 1h')
      expect(result.section('Requirements')).not.toContain('Tokens must expire after 24h')
    })

    it('preserves blocks not mentioned in MODIFIED', () => {
      const delta = makeSpec(
        '## MODIFIED Requirements\n### Requirement: Token expiry\nnew content',
      )
      const result = mergeSpecs(baseSpec, delta, [reqConfig])
      expect(result.section('Requirements')).toContain('### Requirement: Refresh tokens')
    })

    it('adds block if it does not exist in base (upsert)', () => {
      const delta = makeSpec(
        '## MODIFIED Requirements\n### Requirement: Brand new\ncontent',
      )
      const result = mergeSpecs(baseSpec, delta, [reqConfig])
      expect(result.section('Requirements')).toContain('### Requirement: Brand new')
    })
  })

  describe('REMOVED', () => {
    it('removes an existing block', () => {
      const delta = makeSpec('## REMOVED Requirements\n### Requirement: Token expiry')
      const result = mergeSpecs(baseSpec, delta, [reqConfig])
      expect(result.section('Requirements')).not.toContain('### Requirement: Token expiry')
    })

    it('preserves other blocks when removing', () => {
      const delta = makeSpec('## REMOVED Requirements\n### Requirement: Token expiry')
      const result = mergeSpecs(baseSpec, delta, [reqConfig])
      expect(result.section('Requirements')).toContain('### Requirement: Refresh tokens')
    })

    it('silently ignores removing a block that does not exist', () => {
      const delta = makeSpec('## REMOVED Requirements\n### Requirement: Non existent')
      expect(() => mergeSpecs(baseSpec, delta, [reqConfig])).not.toThrow()
    })

    it('removes the section entirely when all blocks are removed', () => {
      const base = makeSpec('## Requirements\n### Requirement: Only one\ncontent')
      const delta = makeSpec('## REMOVED Requirements\n### Requirement: Only one')
      const result = mergeSpecs(base, delta, [reqConfig])
      expect(result.section('Requirements')).toBeNull()
    })
  })

  describe('combined operations', () => {
    it('applies ADDED, MODIFIED, and REMOVED in the same delta', () => {
      const delta = makeSpec(
        '## ADDED Requirements\n### Requirement: Token rotation\nnew requirement\n\n' +
        '## MODIFIED Requirements\n### Requirement: Token expiry\nupdated: expire after 1h\n\n' +
        '## REMOVED Requirements\n### Requirement: Refresh tokens',
      )
      const result = mergeSpecs(baseSpec, delta, [reqConfig])
      const section = result.section('Requirements')

      expect(section).toContain('### Requirement: Token rotation')
      expect(section).toContain('updated: expire after 1h')
      expect(section).not.toContain('Tokens must expire after 24h')
      expect(section).not.toContain('### Requirement: Refresh tokens')
    })
  })

  describe('multiple DeltaConfigs', () => {
    it('processes independent delta sections for each config', () => {
      const base = makeSpec(
        '## Requirements\n### Requirement: Auth\ncontent\n\n' +
        '## Scenarios\n### Scenario: Login\ncontent',
      )
      const delta = makeSpec(
        '## ADDED Requirements\n### Requirement: Logout\nnew req\n\n' +
        '## MODIFIED Scenarios\n### Scenario: Login\nupdated scenario',
      )
      const result = mergeSpecs(base, delta, [reqConfig, scenarioConfig])

      expect(result.section('Requirements')).toContain('### Requirement: Logout')
      expect(result.section('Scenarios')).toContain('updated scenario')
    })

    it('skips configs for which the delta has no matching sections', () => {
      const base = makeSpec('## Requirements\n### Requirement: Auth\ncontent')
      const delta = makeSpec('## ADDED Requirements\n### Requirement: Logout\nnew req')
      const result = mergeSpecs(base, delta, [reqConfig, scenarioConfig])

      expect(result.section('Requirements')).toContain('### Requirement: Logout')
      expect(result.section('Scenarios')).toBeNull()
    })
  })

  describe('RENAMED', () => {
    it('renames an existing block', () => {
      const delta = makeSpec(
        '## RENAMED Requirements\n\nFROM: ### Requirement: Token expiry\nTO:   ### Requirement: Token lifetime',
      )
      const result = mergeSpecs(baseSpec, delta, [reqConfig])
      expect(result.section('Requirements')).toContain('### Requirement: Token lifetime')
      expect(result.section('Requirements')).not.toContain('### Requirement: Token expiry')
    })

    it('preserves block content after rename', () => {
      const delta = makeSpec(
        '## RENAMED Requirements\n\nFROM: ### Requirement: Token expiry\nTO:   ### Requirement: Token lifetime',
      )
      const result = mergeSpecs(baseSpec, delta, [reqConfig])
      expect(result.section('Requirements')).toContain('Tokens must expire after 24h')
    })

    it('silently ignores renaming a block that does not exist', () => {
      const delta = makeSpec(
        '## RENAMED Requirements\n\nFROM: ### Requirement: Non existent\nTO:   ### Requirement: New name',
      )
      expect(() => mergeSpecs(baseSpec, delta, [reqConfig])).not.toThrow()
    })

    it('subsequent MODIFIED uses the new name after RENAMED', () => {
      const delta = makeSpec(
        '## RENAMED Requirements\n\nFROM: ### Requirement: Token expiry\nTO:   ### Requirement: Token lifetime\n\n' +
        '## MODIFIED Requirements\n### Requirement: Token lifetime\nupdated content',
      )
      const result = mergeSpecs(baseSpec, delta, [reqConfig])
      expect(result.section('Requirements')).toContain('updated content')
    })
  })

  describe('custom deltaOperations', () => {
    it('uses custom keywords when provided', () => {
      const delta = makeSpec(
        '## AÑADIDO Requirements\n### Requirement: Token rotation\nnew content',
      )
      const result = mergeSpecs(baseSpec, delta, [reqConfig], {
        added: 'AÑADIDO', modified: 'MODIFICADO', removed: 'ELIMINADO',
        renamed: 'RENOMBRADO', from: 'DE', to: 'A',
      })
      expect(result.section('Requirements')).toContain('### Requirement: Token rotation')
    })

    it('ignores default keyword sections when custom keywords are provided', () => {
      const delta = makeSpec(
        '## ADDED Requirements\n### Requirement: Token rotation\nnew content',
      )
      const result = mergeSpecs(baseSpec, delta, [reqConfig], {
        added: 'AÑADIDO', modified: 'MODIFICADO', removed: 'ELIMINADO',
        renamed: 'RENOMBRADO', from: 'DE', to: 'A',
      })
      expect(result.section('Requirements')).not.toContain('### Requirement: Token rotation')
    })
  })

  describe('conflict detection', () => {
    it('throws DeltaConflictError when same block is in MODIFIED and REMOVED', () => {
      const delta = makeSpec(
        '## MODIFIED Requirements\n### Requirement: Token expiry\nnew content\n\n' +
        '## REMOVED Requirements\n### Requirement: Token expiry',
      )
      expect(() => mergeSpecs(baseSpec, delta, [reqConfig])).toThrow(DeltaConflictError)
    })

    it('throws DeltaConflictError when same block is in MODIFIED and ADDED', () => {
      const delta = makeSpec(
        '## MODIFIED Requirements\n### Requirement: Token expiry\nnew content\n\n' +
        '## ADDED Requirements\n### Requirement: Token expiry\nnew content',
      )
      expect(() => mergeSpecs(baseSpec, delta, [reqConfig])).toThrow(DeltaConflictError)
    })

    it('throws DeltaConflictError when same block is in ADDED and REMOVED', () => {
      const delta = makeSpec(
        '## ADDED Requirements\n### Requirement: New req\nnew content\n\n' +
        '## REMOVED Requirements\n### Requirement: New req',
      )
      expect(() => mergeSpecs(baseSpec, delta, [reqConfig])).toThrow(DeltaConflictError)
    })

    it('throws DeltaConflictError when MODIFIED references FROM name after RENAMED', () => {
      const delta = makeSpec(
        '## RENAMED Requirements\n\nFROM: ### Requirement: Token expiry\nTO:   ### Requirement: Token lifetime\n\n' +
        '## MODIFIED Requirements\n### Requirement: Token expiry\nshould use new name',
      )
      expect(() => mergeSpecs(baseSpec, delta, [reqConfig])).toThrow(DeltaConflictError)
    })

    it('throws DeltaConflictError when ADDED uses a TO name from RENAMED', () => {
      const delta = makeSpec(
        '## RENAMED Requirements\n\nFROM: ### Requirement: Token expiry\nTO:   ### Requirement: Token lifetime\n\n' +
        '## ADDED Requirements\n### Requirement: Token lifetime\nnew content',
      )
      expect(() => mergeSpecs(baseSpec, delta, [reqConfig])).toThrow(DeltaConflictError)
    })

    it('does not mutate base spec when conflict is detected', () => {
      const originalContent = baseSpec.content
      const delta = makeSpec(
        '## MODIFIED Requirements\n### Requirement: Token expiry\nnew\n\n' +
        '## REMOVED Requirements\n### Requirement: Token expiry',
      )
      expect(() => mergeSpecs(baseSpec, delta, [reqConfig])).toThrow(DeltaConflictError)
      expect(baseSpec.content).toBe(originalContent)
    })
  })
})
