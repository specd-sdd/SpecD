import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseSchemaYaml } from '../../../src/infrastructure/schema-yaml-parser.js'
import { buildSchema } from '../../../src/domain/services/build-schema.js'
import { CheckRegistry } from '../../../src/domain/services/check-registry.js'
import { isWorkflowStepEnabled } from '../../../src/domain/services/workflow-topology.js'

const schemaDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'schema-std',
)

/** Loads every template file shipped next to the real standard schema. */
function loadTemplates(): Map<string, string> {
  const templates = new Map<string, string>()
  const templatesDir = join(schemaDir, 'templates')
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (entry.isDirectory()) walk(join(dir, entry.name), relative)
      else templates.set(`templates/${relative}`, readFileSync(join(dir, entry.name), 'utf8'))
    }
  }
  walk(templatesDir, '')
  return templates
}

describe('real @specd/schema-std through buildSchema', () => {
  const data = parseSchemaYaml('#schema-std', readFileSync(join(schemaDir, 'schema.yaml'), 'utf8'))
  const schema = buildSchema('#schema-std', data, loadTemplates(), new CheckRegistry())

  it('declares the standard lifecycle rows with explicit flags', () => {
    const rows = schema.workflow().map((row) => ({
      step: row.step,
      optional: row.optional ?? false,
      disabled: row.disabled ?? false,
    }))
    expect(rows).toEqual([
      { step: 'designing', optional: false, disabled: false },
      { step: 'ready', optional: false, disabled: false },
      { step: 'implementing', optional: false, disabled: false },
      { step: 'verifying', optional: false, disabled: false },
      { step: 'archiving', optional: false, disabled: false },
    ])
  })

  it('enables every standard delivery step', () => {
    for (const step of ['designing', 'ready', 'implementing', 'verifying', 'archiving'] as const) {
      expect(isWorkflowStepEnabled(step, schema)).toBe(true)
    }
  })
})
