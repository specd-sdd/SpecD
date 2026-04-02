import { describe, expect, it } from 'vitest'
import {
  parseSchemaYaml,
  formatZodPath,
  type SchemaYamlData,
} from '../../src/infrastructure/schema-yaml-parser.js'
import { SchemaValidationError } from '../../src/domain/errors/schema-validation-error.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function minimal(extra = ''): string {
  return `kind: schema\nname: test\nversion: 1\nartifacts:\n  - id: spec\n    scope: spec\n    output: spec.md\n${extra}`
}

// ---------------------------------------------------------------------------
// Requirement: Function signature
// ---------------------------------------------------------------------------

describe('parseSchemaYaml — valid minimal schema', () => {
  it('returns SchemaYamlData with parsed name, version, and artifacts', () => {
    const data = parseSchemaYaml('#test', minimal())
    expect(data.name).toBe('test')
    expect(data.version).toBe(1)
    expect(data.kind).toBe('schema')
    expect(data.artifacts).toHaveLength(1)
    expect(data.artifacts![0]!.id).toBe('spec')
  })
})

// ---------------------------------------------------------------------------
// Requirement: Output type
// ---------------------------------------------------------------------------

describe('parseSchemaYaml — optional fields', () => {
  it('includes optional fields when declared', () => {
    const yaml = `
kind: schema
name: full
version: 2
description: A test schema
artifacts:
  - id: spec
    scope: spec
    output: spec.md
workflow:
  - step: designing
`
    const data = parseSchemaYaml('#full', yaml)
    expect(data.description).toBe('A test schema')
    expect(data.workflow).toHaveLength(1)
  })

  it('leaves optional fields undefined when omitted', () => {
    const data = parseSchemaYaml('#test', minimal())
    expect(data.workflow).toBeUndefined()
    expect(data.metadataExtraction).toBeUndefined()
    expect(data.description).toBeUndefined()
    expect(data.extends).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Requirement: kind field
// ---------------------------------------------------------------------------

describe('parseSchemaYaml — kind field', () => {
  it('accepts kind: schema', () => {
    const data = parseSchemaYaml('#test', minimal())
    expect(data.kind).toBe('schema')
  })

  it('accepts kind: schema-plugin', () => {
    const yaml = `kind: schema-plugin\nname: my-plugin\nversion: 1\n`
    const data = parseSchemaYaml('#plugin', yaml)
    expect(data.kind).toBe('schema-plugin')
    expect(data.artifacts).toBeUndefined()
  })

  it('throws when kind is missing', () => {
    const yaml = `name: test\nversion: 1\nartifacts:\n  - id: spec\n    scope: spec\n    output: spec.md\n`
    expect(() => parseSchemaYaml('#test', yaml)).toThrow(SchemaValidationError)
  })

  it('throws when kind is invalid', () => {
    const yaml = `kind: invalid\nname: test\nversion: 1\nartifacts: []\n`
    expect(() => parseSchemaYaml('#test', yaml)).toThrow(SchemaValidationError)
  })
})

// ---------------------------------------------------------------------------
// Requirement: extends field
// ---------------------------------------------------------------------------

describe('parseSchemaYaml — extends field', () => {
  it('accepts extends on kind: schema', () => {
    const yaml = `kind: schema\nname: child\nversion: 1\nextends: '@specd/schema-std'\nartifacts:\n  - id: spec\n    scope: spec\n    output: spec.md\n`
    const data = parseSchemaYaml('#child', yaml)
    expect(data.extends).toBe('@specd/schema-std')
  })
})

// ---------------------------------------------------------------------------
// Requirement: schema-plugin refinement
// ---------------------------------------------------------------------------

describe('parseSchemaYaml — schema-plugin restrictions', () => {
  it('rejects schema-plugin with artifacts', () => {
    const yaml = `kind: schema-plugin\nname: bad\nversion: 1\nartifacts:\n  - id: spec\n    scope: spec\n    output: spec.md\n`
    expect(() => parseSchemaYaml('#bad', yaml)).toThrow(SchemaValidationError)
  })

  it('rejects schema-plugin with workflow', () => {
    const yaml = `kind: schema-plugin\nname: bad\nversion: 1\nworkflow:\n  - step: designing\n`
    expect(() => parseSchemaYaml('#bad', yaml)).toThrow(SchemaValidationError)
  })

  it('rejects schema-plugin with extends', () => {
    const yaml = `kind: schema-plugin\nname: bad\nversion: 1\nextends: '@specd/schema-std'\n`
    expect(() => parseSchemaYaml('#bad', yaml)).toThrow(SchemaValidationError)
  })

  it('requires artifacts for kind: schema', () => {
    const yaml = `kind: schema\nname: bad\nversion: 1\n`
    expect(() => parseSchemaYaml('#bad', yaml)).toThrow(SchemaValidationError)
  })
})

// ---------------------------------------------------------------------------
// Requirement: id on array entries
// ---------------------------------------------------------------------------

describe('parseSchemaYaml — id on validations', () => {
  it('requires id on validation rules', () => {
    const yaml = `
kind: schema
name: test
version: 1
artifacts:
  - id: spec
    scope: spec
    output: spec.md
    validations:
      - type: section
        matches: '^Requirements$'
        required: true
`
    expect(() => parseSchemaYaml('#test', yaml)).toThrow(SchemaValidationError)
  })

  it('accepts validation rules with id', () => {
    const yaml = `
kind: schema
name: test
version: 1
artifacts:
  - id: spec
    scope: spec
    output: spec.md
    validations:
      - id: has-requirements
        type: section
        matches: '^Requirements$'
        required: true
`
    const data = parseSchemaYaml('#test', yaml)
    expect(data.artifacts![0]!.validations![0]!.id).toBe('has-requirements')
  })
})

describe('parseSchemaYaml — id on hook entries', () => {
  it('requires id on hook entries', () => {
    const yaml = `
kind: schema
name: test
version: 1
artifacts:
  - id: spec
    scope: spec
    output: spec.md
workflow:
  - step: designing
    hooks:
      pre:
        - instruction: 'Review the specs.'
`
    expect(() => parseSchemaYaml('#test', yaml)).toThrow(SchemaValidationError)
  })

  it('accepts hook entries with id', () => {
    const yaml = `
kind: schema
name: test
version: 1
artifacts:
  - id: spec
    scope: spec
    output: spec.md
workflow:
  - step: designing
    hooks:
      pre:
        - id: review-specs
          instruction: 'Review the specs.'
`
    const data = parseSchemaYaml('#test', yaml)
    expect(data.workflow![0]!.hooks.pre[0]!.id).toBe('review-specs')
  })

  it('accepts explicit external hook entries with nested config', () => {
    const yaml = `
kind: schema
name: test
version: 1
artifacts:
  - id: spec
    scope: spec
    output: spec.md
workflow:
  - step: designing
    hooks:
      pre:
        - id: docker-test
          external:
            type: docker
            config:
              image: node:20
              command: pnpm test
`
    const data = parseSchemaYaml('#test', yaml)
    expect(data.workflow![0]!.hooks.pre[0]).toEqual({
      id: 'docker-test',
      type: 'external',
      externalType: 'docker',
      config: { image: 'node:20', command: 'pnpm test' },
    })
  })
})

describe('parseSchemaYaml — id on preHashCleanup', () => {
  it('requires id on preHashCleanup entries', () => {
    const yaml = `
kind: schema
name: test
version: 1
artifacts:
  - id: tasks
    scope: change
    output: tasks.md
    preHashCleanup:
      - pattern: '^\\ s*-\\ s+\\[x\\]'
        replacement: '- [ ]'
`
    expect(() => parseSchemaYaml('#test', yaml)).toThrow(SchemaValidationError)
  })
})

describe('parseSchemaYaml — id on metadataExtraction array entries', () => {
  it('requires id on array entries but not scalar entries', () => {
    const yaml = `
kind: schema
name: test
version: 1
artifacts:
  - id: spec
    scope: spec
    output: spec.md
metadataExtraction:
  title:
    artifact: spec
    extractor:
      selector: { type: section, level: 1 }
      extract: label
  rules:
    - artifact: spec
      extractor:
        selector: { type: section }
`
    // Missing id on rules array entry
    expect(() => parseSchemaYaml('#test', yaml)).toThrow(SchemaValidationError)
  })

  it('accepts scalar entries without id', () => {
    const yaml = `
kind: schema
name: test
version: 1
artifacts:
  - id: spec
    scope: spec
    output: spec.md
metadataExtraction:
  title:
    artifact: spec
    extractor:
      selector: { type: section, level: 1 }
      extract: label
`
    const data = parseSchemaYaml('#test', yaml)
    expect(data.metadataExtraction?.title?.artifact).toBe('spec')
  })
})

// ---------------------------------------------------------------------------
// Requirement: rules on artifacts
// ---------------------------------------------------------------------------

describe('parseSchemaYaml — artifact rules', () => {
  it('parses rules.pre and rules.post', () => {
    const yaml = `
kind: schema
name: test
version: 1
artifacts:
  - id: spec
    scope: spec
    output: spec.md
    rules:
      pre:
        - id: normative
          instruction: 'Use SHALL/MUST for normative statements.'
      post:
        - id: examples
          instruction: 'Include examples where possible.'
`
    const data = parseSchemaYaml('#test', yaml)
    const rules = data.artifacts![0]!.rules
    expect(rules?.pre).toHaveLength(1)
    expect(rules?.pre![0]!.id).toBe('normative')
    expect(rules?.post).toHaveLength(1)
    expect(rules?.post![0]!.instruction).toBe('Include examples where possible.')
  })
})

// ---------------------------------------------------------------------------
// Requirement: operations field
// ---------------------------------------------------------------------------

describe('parseSchemaYaml — operations on schema-plugin', () => {
  it('parses operations with all five keys', () => {
    const yaml = `
kind: schema-plugin
name: my-plugin
version: 1
operations:
  remove:
    artifacts:
      - id: old-art
  create:
    artifacts:
      - id: new-art
        scope: change
        output: new.md
  prepend:
    artifacts:
      - id: spec
        rules:
          pre:
            - id: first-rule
              text: Do this first.
  append:
    artifacts:
      - id: spec
        rules:
          post:
            - id: last-rule
              text: Do this last.
  set:
    artifacts:
      - id: spec
        instruction: New instruction
`
    const data = parseSchemaYaml('#plugin', yaml)
    expect(data.kind).toBe('schema-plugin')
    expect(data.operations).toBeDefined()
    expect(data.operations!.remove).toBeDefined()
    expect(data.operations!.create).toBeDefined()
    expect(data.operations!.prepend).toBeDefined()
    expect(data.operations!.append).toBeDefined()
    expect(data.operations!.set).toBeDefined()
  })

  it('accepts schema-plugin with empty operations', () => {
    const yaml = `kind: schema-plugin\nname: empty\nversion: 1\noperations: {}\n`
    const data = parseSchemaYaml('#empty', yaml)
    expect(data.operations).toBeDefined()
  })

  it('accepts schema-plugin with partial operations', () => {
    const yaml = `
kind: schema-plugin
name: partial
version: 1
operations:
  append:
    artifacts:
      - id: spec
        rules:
          post:
            - id: team-rule
              text: Follow conventions.
`
    const data = parseSchemaYaml('#partial', yaml)
    expect(data.operations!.append).toBeDefined()
    expect(data.operations!.remove).toBeUndefined()
  })

  it('rejects operations with unknown keys (strict mode)', () => {
    const yaml = `
kind: schema-plugin
name: bad
version: 1
operations:
  merge:
    artifacts: []
`
    expect(() => parseSchemaYaml('#bad', yaml)).toThrow(SchemaValidationError)
  })
})

describe('parseSchemaYaml — operations on kind: schema', () => {
  it('accepts operations on kind: schema', () => {
    const yaml = `
kind: schema
name: base-with-ops
version: 1
artifacts:
  - id: spec
    scope: spec
    output: spec.md
operations:
  append:
    artifacts:
      - id: spec
        rules:
          post:
            - id: extra-rule
              text: Extra rule.
`
    const data = parseSchemaYaml('#base', yaml)
    expect(data.operations).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Requirement: YAML parsing
// ---------------------------------------------------------------------------

describe('parseSchemaYaml — YAML parsing errors', () => {
  it('throws for null YAML document', () => {
    expect(() => parseSchemaYaml('#test', '')).toThrow('schema file must be a YAML mapping')
  })

  it('throws for array YAML document', () => {
    expect(() => parseSchemaYaml('#test', '- item1\n- item2')).toThrow(
      'schema file must be a YAML mapping',
    )
  })

  it('throws for scalar YAML document', () => {
    expect(() => parseSchemaYaml('#test', 'just a string')).toThrow(
      'schema file must be a YAML mapping',
    )
  })
})

// ---------------------------------------------------------------------------
// Requirement: Zod structural validation
// ---------------------------------------------------------------------------

describe('parseSchemaYaml — Zod structural validation', () => {
  it('throws when name is missing', () => {
    const yaml = `kind: schema\nversion: 1\nartifacts:\n  - id: spec\n    scope: spec\n    output: spec.md\n`
    expect(() => parseSchemaYaml('#test', yaml)).toThrow(SchemaValidationError)
  })

  it('throws when version is not an integer', () => {
    const yaml = `kind: schema\nname: test\nversion: 1.5\nartifacts:\n  - id: spec\n    scope: spec\n    output: spec.md\n`
    expect(() => parseSchemaYaml('#test', yaml)).toThrow(SchemaValidationError)
  })

  it('ignores unknown top-level fields', () => {
    const data = parseSchemaYaml('#test', minimal('futureField: true'))
    expect(data.name).toBe('test')
    expect((data as unknown as Record<string, unknown>)['futureField']).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Requirement: Zod refinement rules
// ---------------------------------------------------------------------------

describe('parseSchemaYaml — Zod refinements', () => {
  it('rejects deltaValidations on non-delta artifact', () => {
    const yaml = `
kind: schema
name: test
version: 1
artifacts:
  - id: spec
    scope: spec
    output: spec.md
    deltaValidations:
      - id: has-section
        type: section
        required: true
`
    expect(() => parseSchemaYaml('#test', yaml)).toThrow(/deltaValidations/)
  })

  it('rejects delta: true with scope: change', () => {
    const yaml = `
kind: schema
name: test
version: 1
artifacts:
  - id: proposal
    scope: change
    output: proposal.md
    delta: true
`
    expect(() => parseSchemaYaml('#test', yaml)).toThrow(/delta/)
  })
})

// ---------------------------------------------------------------------------
// Requirement: Error handling
// ---------------------------------------------------------------------------

describe('parseSchemaYaml — error handling', () => {
  it('includes Zod path in error message', () => {
    const yaml = `
kind: schema
name: test
version: 1
artifacts:
  - id: spec
    scope: invalid
    output: spec.md
`
    try {
      parseSchemaYaml('#test', yaml)
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(SchemaValidationError)
      expect((err as SchemaValidationError).message).toContain('artifacts[0].scope')
    }
  })

  it('includes the ref in the error', () => {
    try {
      parseSchemaYaml('@specd/schema-broken', 'name: test\nversion: oops\n')
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(SchemaValidationError)
      expect((err as SchemaValidationError).ref).toBe('@specd/schema-broken')
    }
  })

  it('reports only the first Zod issue', () => {
    const yaml = `kind: schema\nversion: oops\n`
    try {
      parseSchemaYaml('#test', yaml)
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(SchemaValidationError)
      // Should mention only one field path, not multiple
      const msg = (err as SchemaValidationError).message
      expect(msg.split(':').length).toBeLessThanOrEqual(3)
    }
  })
})

// ---------------------------------------------------------------------------
// Requirement: No semantic validation
// ---------------------------------------------------------------------------

describe('parseSchemaYaml — no semantic validation', () => {
  it('allows duplicate artifact IDs (caller responsibility)', () => {
    const yaml = `
kind: schema
name: test
version: 1
artifacts:
  - id: spec
    scope: spec
    output: spec.md
  - id: spec
    scope: change
    output: spec2.md
`
    const data = parseSchemaYaml('#test', yaml)
    expect(data.artifacts).toHaveLength(2)
  })

  it('allows unknown artifact ID in requires (caller responsibility)', () => {
    const yaml = `
kind: schema
name: test
version: 1
artifacts:
  - id: spec
    scope: spec
    output: spec.md
    requires: [nonexistent]
`
    const data = parseSchemaYaml('#test', yaml)
    expect(data.artifacts![0]!.requires).toEqual(['nonexistent'])
  })
})

// ---------------------------------------------------------------------------
// Requirement: formatZodPath utility
// ---------------------------------------------------------------------------

describe('formatZodPath', () => {
  it('formats numeric segments as brackets', () => {
    expect(formatZodPath(['artifacts', 0, 'scope'])).toBe('artifacts[0].scope')
  })

  it('formats single string segment', () => {
    expect(formatZodPath(['name'])).toBe('name')
  })

  it('returns empty string for empty path', () => {
    expect(formatZodPath([])).toBe('')
  })
})
