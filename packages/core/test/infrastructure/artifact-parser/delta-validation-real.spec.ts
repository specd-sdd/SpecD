import { describe, expect, it } from 'vitest'
import { YamlParser } from '../../../src/infrastructure/artifact-parser/yaml-parser.js'
import { evaluateRules } from '../../../src/domain/services/rule-evaluator.js'
import { type ValidationRule } from '../../../src/domain/value-objects/validation-rule.js'

describe('Real Delta Validation Logic', () => {
  const parser = new YamlParser()
  const artifactId = 'verify'

  const rules: ValidationRule[] = [
    {
      id: 'verify-requirement-delta-has-scenario',
      selector: {
        type: 'sequence-item'
      },
      // Logic: IF ((op:added AND content:### Requirement:) OR (op:modified AND matches:Requirement:))
      //        THEN MUST have #### Scenario:
      // We use lookaheads (?=...) with [\s\S]* to ensure we match across lines and regardless of field order.
      contentMatches: '^(?:(?!(?=^[\\s\\S]*op: added)(?=[\\s\\S]*content:[^]*### Requirement:)|(?=[\\s\\S]*op: modified)(?=[\\s\\S]*matches:[^]*Requirement:))[\\s\\S]*|[\\s\\S]*#### Scenario:[\\s\\S]*)$',
      required: true
    }
  ]

  it('passes when adding a requirement with a scenario', () => {
    const delta = `
- op: added
  content: |-
    ### Requirement: New Req
    #### Scenario: Some scenario
    - WHEN something
    - THEN something else
`
    const ast = parser.parse(delta)
    const result = evaluateRules(rules, ast.root, artifactId, parser)
    expect(result.failures).toHaveLength(0)
  })

  it('fails when adding a requirement WITHOUT a scenario', () => {
    const delta = `
- op: added
  content: |-
    ### Requirement: New Req
    Just some text here, no scenario.
`
    const ast = parser.parse(delta)
    const result = evaluateRules(rules, ast.root, artifactId, parser)
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]!.description).toContain('does not match pattern')
  })

  it('skips validation when adding something that is NOT a requirement', () => {
    const delta = `
- op: added
  content: |-
    ### Just a Note
    This is not a requirement heading.
`
    const ast = parser.parse(delta)
    const result = evaluateRules(rules, ast.root, artifactId, parser)
    expect(result.failures).toHaveLength(0)
  })

  it('passes when modifying a requirement with a scenario', () => {
    const delta = `
- op: modified
  selector:
    type: section
    matches: 'Requirement: Existing Req'
  content: |-
    #### Scenario: Updated scenario
    - WHEN changed
    - THEN reflects change
`
    const ast = parser.parse(delta)
    const result = evaluateRules(rules, ast.root, artifactId, parser)
    expect(result.failures).toHaveLength(0)
  })

  it('fails when modifying a requirement WITHOUT a scenario', () => {
    const delta = `
- op: modified
  selector:
    type: section
    matches: 'Requirement: Existing Req'
  content: |-
    Just updating prose, forgot the scenario.
`
    const ast = parser.parse(delta)
    const result = evaluateRules(rules, ast.root, artifactId, parser)
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]!.description).toContain('does not match pattern')
  })

  it('skips validation when modifying something that is NOT a requirement', () => {
    const delta = `
- op: modified
  selector:
    type: section
    matches: 'Purpose'
  content: |-
    Updating the purpose section.
`
    const ast = parser.parse(delta)
    const result = evaluateRules(rules, ast.root, artifactId, parser)
    expect(result.failures).toHaveLength(0)
  })
  
  it('allows removal without scenarios', () => {
    const delta = `
- op: removed
  selector:
    type: section
    matches: 'Requirement: Dead Req'
`
    const ast = parser.parse(delta)
    const result = evaluateRules(rules, ast.root, artifactId, parser)
    expect(result.failures).toHaveLength(0)
  })
})
