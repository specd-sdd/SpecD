import { describe, it, expect, vi } from 'vitest'
import { ValidateSchema } from '../../../src/application/use-cases/validate-schema.js'
import {
  type SchemaRegistry,
  type SchemaRawResult,
} from '../../../src/application/ports/schema-registry.js'
import { type SchemaYamlData } from '../../../src/domain/services/build-schema.js'
import { type ResolveSchema } from '../../../src/application/use-cases/resolve-schema.js'
import { type Schema } from '../../../src/domain/value-objects/schema.js'
import { makeSchema, makeWorkflowStep } from './helpers.js'

const data: SchemaYamlData = {
  kind: 'schema',
  name: 'anchor-test',
  version: 1,
  artifacts: [{ id: 'spec', scope: 'spec', output: 'spec.md' }],
}

function raw(): SchemaRawResult {
  return { data, templates: new Map(), resolvedPath: '/schemas/anchor/schema.yaml' }
}

function registry(): SchemaRegistry {
  return {
    async resolve() {
      return null
    },
    async resolveRaw() {
      return raw()
    },
    async list() {
      return []
    },
  }
}

function sutFor(schema: Schema, approvals?: { spec: boolean; signoff: boolean }) {
  const build = vi.fn().mockReturnValue(schema)
  const resolveSchema = { execute: vi.fn().mockResolvedValue(schema) } as unknown as ResolveSchema
  return new ValidateSchema(registry(), '@specd/schema-std', build, resolveSchema, approvals)
}

const disabledReady = makeSchema({
  name: 'anchor-test',
  workflow: [makeWorkflowStep('ready', { disabled: true })],
})
const enabledReady = makeSchema({
  name: 'anchor-test',
  workflow: [makeWorkflowStep('ready')],
})

const modes = [
  { label: 'project-raw', input: { mode: 'project-raw' } as const },
  { label: 'file', input: { mode: 'file', filePath: '/schemas/anchor/schema.yaml' } as const },
  { label: 'ref', input: { mode: 'ref', ref: '@acme/anchor' } as const },
]

describe('ValidateSchema approval anchor check', () => {
  describe.each(modes)('$label mode', ({ input }) => {
    it('rejects a disabled ready step when the spec approval gate is active', async () => {
      const result = await sutFor(disabledReady, { spec: true, signoff: false }).execute(input)

      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.errors).toHaveLength(1)
        expect(result.errors[0]).toContain(
          "Approval anchor state 'ready' cannot be disabled when spec approval gate is active",
        )
      }
    })

    it('accepts a disabled ready step when the spec approval gate is off', async () => {
      const result = await sutFor(disabledReady, { spec: false, signoff: true }).execute(input)

      expect(result.valid).toBe(true)
    })

    it('accepts an enabled ready step when the spec approval gate is active', async () => {
      const result = await sutFor(enabledReady, { spec: true, signoff: false }).execute(input)

      expect(result.valid).toBe(true)
    })

    it('skips the anchor check entirely when no approval gates are supplied', async () => {
      const result = await sutFor(disabledReady).execute(input)

      expect(result.valid).toBe(true)
    })
  })

  it('rejects a disabled bedrock step regardless of the approval gates', async () => {
    const schema = makeSchema({
      name: 'anchor-test',
      workflow: [makeWorkflowStep('designing', { disabled: true })],
    })

    const result = await sutFor(schema, { spec: false, signoff: false }).execute({
      mode: 'project-raw',
    })

    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors[0]).toContain("Bedrock state 'designing'")
  })

  it('reports the failure as a structured result instead of throwing', async () => {
    const sut = sutFor(disabledReady, { spec: true, signoff: false })

    await expect(sut.execute({ mode: 'project-raw' })).resolves.toMatchObject({ valid: false })
  })

  it('does not run the anchor check in project mode (the resolver owns it)', async () => {
    const result = await sutFor(disabledReady, { spec: true, signoff: false }).execute({
      mode: 'project',
    })

    expect(result.valid).toBe(true)
  })
})
