import { describe, it, expect } from 'vitest'
import { InferSpecSections } from '../../../src/application/use-cases/infer-spec-sections.js'
import { SchemaNotFoundError } from '../../../src/application/errors/schema-not-found-error.js'
import { type ArtifactNode } from '../../../src/application/ports/artifact-parser.js'
import {
  makeSchemaRegistry,
  makeArtifactType,
  makeSchema,
  makeParser,
  makeParsers,
} from './helpers.js'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InferSpecSections', () => {
  it('returns empty arrays when no contextSections defined in schema', async () => {
    const specType = makeArtifactType('specs', {
      scope: 'spec',
      output: 'spec.md',
      format: 'markdown',
      contextSections: [],
    })
    const schema = makeSchema([specType])

    const artifacts = new Map([['spec.md', { content: '# Spec Content' }]])

    const uc = new InferSpecSections(makeSchemaRegistry(schema), makeParsers(), 'test', new Map())
    const result = await uc.execute({ artifacts })

    expect(result.rules).toEqual([])
    expect(result.constraints).toEqual([])
    expect(result.scenarios).toEqual([])
  })

  it('throws SchemaNotFoundError when schema not found', async () => {
    const artifacts = new Map([['spec.md', { content: '# Spec' }]])

    const uc = new InferSpecSections(
      makeSchemaRegistry(null),
      makeParsers(),
      'missing-schema',
      new Map(),
    )

    await expect(uc.execute({ artifacts })).rejects.toThrow(SchemaNotFoundError)
  })

  it('extracts sections from artifact content via selector matching', async () => {
    const ruleNode: ArtifactNode = {
      type: 'section',
      label: 'Must validate input',
      children: [],
    }
    const constraintNode: ArtifactNode = {
      type: 'list-item',
      label: 'Max 100 chars',
      children: [],
    }
    const scenarioNode: ArtifactNode = {
      type: 'section',
      label: 'User logs in',
      children: [],
    }
    const rootNode: ArtifactNode = {
      type: 'root',
      children: [ruleNode, constraintNode, scenarioNode],
    }

    const parser = makeParser({
      parse: () => ({ root: rootNode }),
      renderSubtree: (node: ArtifactNode) => node.label ?? '',
    })

    const specType = makeArtifactType('specs', {
      scope: 'spec',
      output: 'spec.md',
      format: 'markdown',
      contextSections: [
        {
          selector: { type: 'section', matches: '^Must' },
          role: 'rules',
          extract: 'label',
        },
        {
          selector: { type: 'list-item' },
          role: 'constraints',
          extract: 'content',
        },
        {
          selector: { type: 'section', matches: '^User' },
          role: 'scenarios',
          extract: 'label',
        },
      ],
    })
    const schema = makeSchema([specType])

    const artifacts = new Map([['spec.md', { content: '# Spec' }]])
    const parsers = makeParsers(parser)

    const uc = new InferSpecSections(makeSchemaRegistry(schema), parsers, 'test', new Map())
    const result = await uc.execute({ artifacts })

    expect(result.rules).toEqual(['Must validate input'])
    expect(result.constraints).toEqual(['Max 100 chars'])
    expect(result.scenarios).toEqual(['User logs in'])
  })
})
