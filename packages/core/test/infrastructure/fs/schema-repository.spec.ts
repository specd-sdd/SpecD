import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FsSchemaRepository } from '../../../src/infrastructure/fs/schema-repository.js'
import { SchemaValidationError } from '../../../src/domain/errors/schema-validation-error.js'

// ---- Helpers ----

let tmpDir: string
let schemasPath: string

async function writeSchemaFile(dir: string, name: string, content: string): Promise<string> {
  const schemaDir = path.join(dir, name)
  await fs.mkdir(schemaDir, { recursive: true })
  const schemaFile = path.join(schemaDir, 'schema.yaml')
  await fs.writeFile(schemaFile, content, 'utf-8')
  return schemaDir
}

function createRepo(
  overrides: { workspace?: string; schemasPath?: string } = {},
): FsSchemaRepository {
  return new FsSchemaRepository({
    workspace: overrides.workspace ?? 'default',
    ownership: 'owned',
    isExternal: false,
    schemasPath: overrides.schemasPath ?? schemasPath,
  })
}

const MINIMAL_SCHEMA = `
kind: schema
name: test-schema
version: 1
artifacts:
  - id: specs
    scope: spec
    output: "specs/**/spec.md"
`

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-test-'))
  schemasPath = path.join(tmpDir, 'schemas')
  await fs.mkdir(schemasPath, { recursive: true })
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// resolve
// ---------------------------------------------------------------------------

describe('FsSchemaRepository — resolve', () => {
  it('returns a Schema for an existing workspace schema', async () => {
    await writeSchemaFile(schemasPath, 'my-schema', MINIMAL_SCHEMA)
    const repo = createRepo()
    const schema = await repo.resolve('my-schema')
    expect(schema).not.toBeNull()
    expect(schema?.name()).toBe('test-schema')
    expect(schema?.version()).toBe(1)
    expect(schema?.artifacts()).toHaveLength(1)
    expect(schema?.artifacts()[0]!.id).toBe('specs')
  })

  it('returns null when the schema does not exist', async () => {
    const repo = createRepo()
    const result = await repo.resolve('nonexistent')
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// resolveRaw
// ---------------------------------------------------------------------------

describe('FsSchemaRepository — resolveRaw', () => {
  it('returns SchemaRawResult with data, templates, and resolvedPath', async () => {
    await writeSchemaFile(schemasPath, 'raw-schema', MINIMAL_SCHEMA)
    const repo = createRepo()
    const raw = await repo.resolveRaw('raw-schema')

    expect(raw).not.toBeNull()
    expect(raw!.data.name).toBe('test-schema')
    expect(raw!.data.version).toBe(1)
    expect(raw!.data.artifacts).toHaveLength(1)
    expect(raw!.templates).toBeInstanceOf(Map)
    expect(raw!.templates.size).toBe(0)
    expect(raw!.resolvedPath).toBe(path.join(schemasPath, 'raw-schema', 'schema.yaml'))
  })

  it('returns null when the schema does not exist', async () => {
    const repo = createRepo()
    const result = await repo.resolveRaw('nonexistent')
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe('FsSchemaRepository — list', () => {
  it('returns SchemaEntry[] with correct fields for default workspace', async () => {
    await writeSchemaFile(schemasPath, 'alpha', MINIMAL_SCHEMA)
    await writeSchemaFile(schemasPath, 'beta', MINIMAL_SCHEMA)
    const repo = createRepo()
    const entries = await repo.list()

    expect(entries).toHaveLength(2)
    const names = entries.map((e) => e.name).sort()
    expect(names).toEqual(['alpha', 'beta'])

    for (const entry of entries) {
      expect(entry.source).toBe('workspace')
      expect(entry.workspace).toBe('default')
      expect(entry.ref).toBe(`#${entry.name}`)
    }
  })

  it('generates #workspace:name ref for non-default workspace', async () => {
    await writeSchemaFile(schemasPath, 'billing-schema', MINIMAL_SCHEMA)
    const repo = createRepo({ workspace: 'billing' })
    const entries = await repo.list()

    expect(entries).toHaveLength(1)
    expect(entries[0]!.ref).toBe('#billing:billing-schema')
    expect(entries[0]!.name).toBe('billing-schema')
    expect(entries[0]!.workspace).toBe('billing')
  })

  it('does not throw on invalid YAML inside a schema directory', async () => {
    // A directory with a schema.yaml file is still listed; validation
    // only happens on resolve, not on list.
    await writeSchemaFile(schemasPath, 'bad-yaml', 'not: [valid: yaml: {{')
    await writeSchemaFile(schemasPath, 'good', MINIMAL_SCHEMA)
    const repo = createRepo()
    const entries = await repo.list()

    // list() only checks for directory + schema.yaml existence, not validity
    const names = entries.map((e) => e.name).sort()
    expect(names).toEqual(['bad-yaml', 'good'])
  })

  it('skips subdirectories without a schema.yaml file', async () => {
    await fs.mkdir(path.join(schemasPath, 'empty-dir'), { recursive: true })
    await writeSchemaFile(schemasPath, 'valid', MINIMAL_SCHEMA)
    const repo = createRepo()
    const entries = await repo.list()

    expect(entries).toHaveLength(1)
    expect(entries[0]!.name).toBe('valid')
  })

  it('returns empty array when schemasPath directory does not exist', async () => {
    const repo = createRepo({ schemasPath: path.join(tmpDir, 'nonexistent') })
    const entries = await repo.list()
    expect(entries).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// workspace scoping — accessors return construction-time values
// ---------------------------------------------------------------------------

describe('FsSchemaRepository — workspace scoping', () => {
  it('workspace() returns the configured workspace name', () => {
    const repo = createRepo({ workspace: 'billing' })
    expect(repo.workspace()).toBe('billing')
  })

  it('ownership() returns the configured ownership', () => {
    const repo = new FsSchemaRepository({
      workspace: 'default',
      ownership: 'shared',
      isExternal: false,
      schemasPath,
    })
    expect(repo.ownership()).toBe('shared')
  })

  it('isExternal() returns the configured isExternal flag', () => {
    const repo = new FsSchemaRepository({
      workspace: 'default',
      ownership: 'owned',
      isExternal: true,
      schemasPath,
    })
    expect(repo.isExternal()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// template loading
// ---------------------------------------------------------------------------

describe('FsSchemaRepository — template loading', () => {
  it('loads template content referenced in an artifact', async () => {
    const schemaContent = `
kind: schema
name: with-template
version: 1
artifacts:
  - id: spec
    scope: spec
    output: spec.md
    template: templates/spec.md
`
    const schemaDir = await writeSchemaFile(schemasPath, 'with-template', schemaContent)
    const templatesDir = path.join(schemaDir, 'templates')
    await fs.mkdir(templatesDir, { recursive: true })
    await fs.writeFile(
      path.join(templatesDir, 'spec.md'),
      '# Spec Template\n<!-- Fill this in -->',
      'utf-8',
    )

    const repo = createRepo()
    const schema = await repo.resolve('with-template')
    expect(schema).not.toBeNull()
    const artifact = schema?.artifact('spec')
    expect(artifact?.template).toBe('# Spec Template\n<!-- Fill this in -->')
  })

  it('returns templates map in resolveRaw when template is declared', async () => {
    const schemaContent = `
kind: schema
name: with-template-raw
version: 1
artifacts:
  - id: spec
    scope: spec
    output: spec.md
    template: templates/spec.md
`
    const schemaDir = await writeSchemaFile(schemasPath, 'with-template-raw', schemaContent)
    const templatesDir = path.join(schemaDir, 'templates')
    await fs.mkdir(templatesDir, { recursive: true })
    await fs.writeFile(path.join(templatesDir, 'spec.md'), 'template content here', 'utf-8')

    const repo = createRepo()
    const raw = await repo.resolveRaw('with-template-raw')
    expect(raw).not.toBeNull()
    expect(raw!.templates.size).toBe(1)
    expect(raw!.templates.get('templates/spec.md')).toBe('template content here')
  })

  it('throws SchemaValidationError when template file is missing', async () => {
    const schemaContent = `
kind: schema
name: missing-template
version: 1
artifacts:
  - id: spec
    scope: spec
    output: spec.md
    template: templates/nonexistent.md
`
    await writeSchemaFile(schemasPath, 'missing-template', schemaContent)
    const repo = createRepo()
    await expect(repo.resolve('missing-template')).rejects.toThrow(SchemaValidationError)
  })

  it('does not duplicate template reads for artifacts sharing the same template', async () => {
    const schemaContent = `
kind: schema
name: shared-template
version: 1
artifacts:
  - id: spec
    scope: spec
    output: spec.md
    template: templates/shared.md
  - id: design
    scope: change
    output: design.md
    optional: true
    template: templates/shared.md
`
    const schemaDir = await writeSchemaFile(schemasPath, 'shared-template', schemaContent)
    const templatesDir = path.join(schemaDir, 'templates')
    await fs.mkdir(templatesDir, { recursive: true })
    await fs.writeFile(path.join(templatesDir, 'shared.md'), 'shared template', 'utf-8')

    const repo = createRepo()
    const raw = await repo.resolveRaw('shared-template')
    expect(raw).not.toBeNull()
    // Only one entry in the map even though two artifacts reference the same template
    expect(raw!.templates.size).toBe(1)
    expect(raw!.templates.get('templates/shared.md')).toBe('shared template')
  })
})
