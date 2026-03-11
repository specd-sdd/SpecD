import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FsSchemaRegistry } from '../../../src/infrastructure/fs/schema-registry.js'
import { SchemaValidationError } from '../../../src/domain/errors/schema-validation-error.js'

// ---- Setup / teardown helpers ----

interface RegistryContext {
  registry: FsSchemaRegistry
  tmpDir: string
  nodeModulesPath: string
  defaultSchemasPath: string
  workspaceSchemasPaths: Map<string, string>
}

async function setupRegistry(): Promise<RegistryContext> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-schema-test-'))
  const nodeModulesPath = path.join(tmpDir, 'node_modules')
  const defaultSchemasPath = path.join(tmpDir, 'schemas', 'default')
  await fs.mkdir(nodeModulesPath, { recursive: true })
  await fs.mkdir(defaultSchemasPath, { recursive: true })
  const registry = new FsSchemaRegistry({ nodeModulesPaths: [nodeModulesPath], configDir: tmpDir })
  const workspaceSchemasPaths = new Map([['default', defaultSchemasPath]])
  return { registry, tmpDir, nodeModulesPath, defaultSchemasPath, workspaceSchemasPaths }
}

async function writeSchemaFile(dir: string, name: string, content: string): Promise<string> {
  const schemaDir = path.join(dir, name)
  await fs.mkdir(schemaDir, { recursive: true })
  const schemaFile = path.join(schemaDir, 'schema.yaml')
  await fs.writeFile(schemaFile, content, 'utf-8')
  return schemaDir
}

const MINIMAL_SCHEMA = `
name: minimal
version: 1
artifacts:
  - id: spec
    scope: spec
    output: spec.md
`

const FULL_SCHEMA = `
name: full-schema
version: 2
description: Full test schema
artifacts:
  - id: proposal
    scope: change
    output: proposal.md
    description: Initial proposal
    instruction: Write the proposal.
    requires: []
    optional: false

  - id: specs
    scope: spec
    output: specs/**/spec.md
    delta: true
    requires:
      - proposal
    validations:
      - selector:
          type: section
          matches: '^Requirements$'
        required: true

  - id: design
    scope: change
    output: design.md
    optional: true
    requires:
      - proposal

workflow:
  - step: designing
    requires: []
  - step: implementing
    requires: [specs]
    hooks:
      pre:
        - instruction: 'Review the specs before implementing.'
        - run: 'echo start'
      post:
        - run: 'pnpm test'
`

let ctx: RegistryContext

beforeEach(async () => {
  ctx = await setupRegistry()
})

afterEach(async () => {
  await fs.rm(ctx.tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Schema resolution — ref parsing
// ---------------------------------------------------------------------------

describe('Schema resolution — bare name resolved from default workspace', () => {
  it('resolves bare name to default workspace schemas path', async () => {
    await writeSchemaFile(ctx.defaultSchemasPath, 'my-schema', MINIMAL_SCHEMA)
    const schema = await ctx.registry.resolve('my-schema', ctx.workspaceSchemasPaths)
    expect(schema).not.toBeNull()
    expect(schema?.name()).toBe('minimal')
    expect(schema?.version()).toBe(1)
  })
})

describe('Schema resolution — #name resolved from default workspace', () => {
  it('resolves #name to default workspace schemas path', async () => {
    await writeSchemaFile(ctx.defaultSchemasPath, 'spec-driven', MINIMAL_SCHEMA)
    const schema = await ctx.registry.resolve('#spec-driven', ctx.workspaceSchemasPaths)
    expect(schema).not.toBeNull()
    expect(schema?.name()).toBe('minimal')
  })
})

describe('Schema resolution — #workspace:name', () => {
  it('resolves #workspace:name to the given workspace schemas path', async () => {
    const billingPath = path.join(ctx.tmpDir, 'schemas', 'billing')
    await fs.mkdir(billingPath, { recursive: true })
    await writeSchemaFile(billingPath, 'billing-schema', MINIMAL_SCHEMA)
    const paths = new Map([
      ['default', ctx.defaultSchemasPath],
      ['billing', billingPath],
    ])
    const schema = await ctx.registry.resolve('#billing:billing-schema', paths)
    expect(schema).not.toBeNull()
    expect(schema?.name()).toBe('minimal')
  })
})

describe('Schema resolution — npm package resolved', () => {
  it('resolves @scope/name to node_modules/@scope/name/schema.yaml', async () => {
    const pkgDir = path.join(ctx.nodeModulesPath, '@specd', 'schema-std')
    await fs.mkdir(pkgDir, { recursive: true })
    await fs.writeFile(path.join(pkgDir, 'schema.yaml'), MINIMAL_SCHEMA, 'utf-8')
    const schema = await ctx.registry.resolve('@specd/schema-std', ctx.workspaceSchemasPaths)
    expect(schema).not.toBeNull()
    expect(schema?.name()).toBe('minimal')
  })
})

describe('Schema resolution — direct path resolved', () => {
  it('resolves an absolute path directly', async () => {
    const schemaFile = path.join(ctx.tmpDir, 'custom-schema.yaml')
    await fs.writeFile(schemaFile, MINIMAL_SCHEMA, 'utf-8')
    const schema = await ctx.registry.resolve(schemaFile, ctx.workspaceSchemasPaths)
    expect(schema).not.toBeNull()
    expect(schema?.name()).toBe('minimal')
  })
})

describe('Schema resolution — schema not found', () => {
  it('returns null when the schema file does not exist', async () => {
    const schema = await ctx.registry.resolve('nonexistent', ctx.workspaceSchemasPaths)
    expect(schema).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Schema validation on load
// ---------------------------------------------------------------------------

describe('Schema validation on load — minimal valid schema', () => {
  it('loads a minimal schema with name, version, and artifacts', async () => {
    await writeSchemaFile(ctx.defaultSchemasPath, 'minimal', MINIMAL_SCHEMA)
    const schema = await ctx.registry.resolve('minimal', ctx.workspaceSchemasPaths)
    expect(schema).not.toBeNull()
    expect(schema?.artifacts()).toHaveLength(1)
    expect(schema?.artifacts()[0]!.id).toBe('spec')
    expect(schema?.workflow()).toHaveLength(0)
  })
})

describe('Schema validation on load — full schema', () => {
  it('loads a full schema with artifacts and workflow', async () => {
    await writeSchemaFile(ctx.defaultSchemasPath, 'full', FULL_SCHEMA)
    const schema = await ctx.registry.resolve('full', ctx.workspaceSchemasPaths)
    expect(schema).not.toBeNull()
    expect(schema?.name()).toBe('full-schema')
    expect(schema?.version()).toBe(2)
    expect(schema?.artifacts()).toHaveLength(3)
    expect(schema?.workflow()).toHaveLength(2)
  })
})

describe('Schema validation on load — unknown field ignored', () => {
  it('ignores unknown top-level fields (forward compatibility)', async () => {
    const content = `
name: compat
version: 1
artifacts:
  - id: spec
    scope: spec
    output: spec.md
futureField: ignored
`
    await writeSchemaFile(ctx.defaultSchemasPath, 'compat', content)
    const schema = await ctx.registry.resolve('compat', ctx.workspaceSchemasPaths)
    expect(schema).not.toBeNull()
    expect(schema?.name()).toBe('compat')
  })
})

describe('Schema validation on load — missing required field', () => {
  it('throws SchemaValidationError when name is missing', async () => {
    const content = `
version: 1
artifacts:
  - id: spec
    scope: spec
    output: spec.md
`
    await writeSchemaFile(ctx.defaultSchemasPath, 'no-name', content)
    await expect(ctx.registry.resolve('no-name', ctx.workspaceSchemasPaths)).rejects.toThrow(
      SchemaValidationError,
    )
  })

  it('throws SchemaValidationError when artifacts is missing', async () => {
    const content = `
name: no-artifacts
version: 1
`
    await writeSchemaFile(ctx.defaultSchemasPath, 'no-artifacts', content)
    await expect(ctx.registry.resolve('no-artifacts', ctx.workspaceSchemasPaths)).rejects.toThrow(
      SchemaValidationError,
    )
  })
})

describe('Schema validation on load — duplicate artifact ID', () => {
  it('throws SchemaValidationError for duplicate artifact IDs', async () => {
    const content = `
name: dup-id
version: 1
artifacts:
  - id: spec
    scope: spec
    output: spec.md
  - id: spec
    scope: change
    output: spec2.md
`
    await writeSchemaFile(ctx.defaultSchemasPath, 'dup-id', content)
    await expect(ctx.registry.resolve('dup-id', ctx.workspaceSchemasPaths)).rejects.toThrow(
      SchemaValidationError,
    )
  })
})

describe('Schema validation on load — duplicate workflow step', () => {
  it('throws SchemaValidationError for duplicate workflow step names', async () => {
    const content = `
name: dup-step
version: 1
artifacts:
  - id: spec
    scope: spec
    output: spec.md
workflow:
  - step: designing
  - step: designing
`
    await writeSchemaFile(ctx.defaultSchemasPath, 'dup-step', content)
    await expect(ctx.registry.resolve('dup-step', ctx.workspaceSchemasPaths)).rejects.toThrow(
      SchemaValidationError,
    )
  })
})

describe('Schema validation on load — unknown artifact ID in requires', () => {
  it('throws SchemaValidationError when requires references a non-existent artifact', async () => {
    const content = `
name: bad-requires
version: 1
artifacts:
  - id: spec
    scope: spec
    output: spec.md
    requires:
      - nonexistent
`
    await writeSchemaFile(ctx.defaultSchemasPath, 'bad-requires', content)
    await expect(ctx.registry.resolve('bad-requires', ctx.workspaceSchemasPaths)).rejects.toThrow(
      SchemaValidationError,
    )
  })
})

describe('Artifact definition — circular dependency in artifact graph', () => {
  it('throws SchemaValidationError when artifacts form a cycle in requires', async () => {
    const content = `
name: cycle
version: 1
artifacts:
  - id: a
    scope: change
    output: a.md
    optional: true
    requires: [b]
  - id: b
    scope: change
    output: b.md
    optional: true
    requires: [a]
`
    await writeSchemaFile(ctx.defaultSchemasPath, 'cycle', content)
    await expect(ctx.registry.resolve('cycle', ctx.workspaceSchemasPaths)).rejects.toThrow(
      SchemaValidationError,
    )
  })
})

describe('Artifact definition — non-optional artifact requires optional artifact', () => {
  it('throws SchemaValidationError when non-optional artifact requires optional artifact', async () => {
    const content = `
name: opt-violation
version: 1
artifacts:
  - id: a
    scope: change
    output: a.md
    optional: true
  - id: b
    scope: change
    output: b.md
    requires: [a]
`
    await writeSchemaFile(ctx.defaultSchemasPath, 'opt-violation', content)
    await expect(ctx.registry.resolve('opt-violation', ctx.workspaceSchemasPaths)).rejects.toThrow(
      SchemaValidationError,
    )
  })
})

describe('Artifact definition — deltaValidations on non-delta artifact', () => {
  it('throws SchemaValidationError when deltaValidations is declared without delta:true', async () => {
    const content = `
name: bad-delta-validations
version: 1
artifacts:
  - id: spec
    scope: spec
    output: spec.md
    delta: false
    deltaValidations:
      - selector:
          type: section
        required: true
`
    await writeSchemaFile(ctx.defaultSchemasPath, 'bad-delta-validations', content)
    await expect(
      ctx.registry.resolve('bad-delta-validations', ctx.workspaceSchemasPaths),
    ).rejects.toThrow(SchemaValidationError)
  })
})

describe('Template resolution — template loaded at resolve time', () => {
  it('reads template file content and stores it in the artifact', async () => {
    const schemaDir = await writeSchemaFile(
      ctx.defaultSchemasPath,
      'with-template',
      `
name: with-template
version: 1
artifacts:
  - id: spec
    scope: spec
    output: spec.md
    template: templates/spec.md
`,
    )
    const templatesDir = path.join(schemaDir, 'templates')
    await fs.mkdir(templatesDir, { recursive: true })
    await fs.writeFile(
      path.join(templatesDir, 'spec.md'),
      '# Spec Template\n<!-- Fill this in -->',
      'utf-8',
    )

    const schema = await ctx.registry.resolve('with-template', ctx.workspaceSchemasPaths)
    expect(schema).not.toBeNull()
    const artifact = schema?.artifact('spec')
    expect(artifact?.template).toBe('# Spec Template\n<!-- Fill this in -->')
  })
})

describe('Template resolution — template file not found', () => {
  it('throws SchemaValidationError when the template file does not exist', async () => {
    await writeSchemaFile(
      ctx.defaultSchemasPath,
      'missing-template',
      `
name: missing-template
version: 1
artifacts:
  - id: spec
    scope: spec
    output: spec.md
    template: templates/nonexistent.md
`,
    )
    await expect(
      ctx.registry.resolve('missing-template', ctx.workspaceSchemasPaths),
    ).rejects.toThrow(SchemaValidationError)
  })
})

describe('Template resolution — no template declared', () => {
  it('leaves template undefined when no template field is declared', async () => {
    await writeSchemaFile(ctx.defaultSchemasPath, 'no-template', MINIMAL_SCHEMA)
    const schema = await ctx.registry.resolve('no-template', ctx.workspaceSchemasPaths)
    expect(schema?.artifact('spec')?.template).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// list()
// ---------------------------------------------------------------------------

describe('list — workspace schemas listed first, npm schemas last', () => {
  it('returns workspace schemas before npm schemas', async () => {
    await writeSchemaFile(ctx.defaultSchemasPath, 'local-schema', MINIMAL_SCHEMA)
    const pkgDir = path.join(ctx.nodeModulesPath, '@specd', 'schema-std')
    await fs.mkdir(pkgDir, { recursive: true })
    await fs.writeFile(path.join(pkgDir, 'schema.yaml'), MINIMAL_SCHEMA, 'utf-8')

    const entries = await ctx.registry.list(ctx.workspaceSchemasPaths)
    expect(entries.length).toBe(2)
    expect(entries[0]!.source).toBe('workspace')
    expect(entries[1]!.source).toBe('npm')
  })
})

describe('list — workspace entry has correct ref and name', () => {
  it('generates #name ref for default workspace schemas', async () => {
    await writeSchemaFile(ctx.defaultSchemasPath, 'my-schema', MINIMAL_SCHEMA)
    const entries = await ctx.registry.list(ctx.workspaceSchemasPaths)
    expect(entries).toHaveLength(1)
    expect(entries[0]!.ref).toBe('#my-schema')
    expect(entries[0]!.name).toBe('my-schema')
    expect(entries[0]!.workspace).toBe('default')
  })
})

describe('list — non-default workspace has qualified ref', () => {
  it('generates #workspace:name ref for non-default workspace schemas', async () => {
    const billingPath = path.join(ctx.tmpDir, 'schemas', 'billing')
    await fs.mkdir(billingPath, { recursive: true })
    await writeSchemaFile(billingPath, 'billing-schema', MINIMAL_SCHEMA)
    const paths = new Map([
      ['default', ctx.defaultSchemasPath],
      ['billing', billingPath],
    ])
    const entries = await ctx.registry.list(paths)
    const billing = entries.find((e) => e.workspace === 'billing')
    expect(billing?.ref).toBe('#billing:billing-schema')
    expect(billing?.name).toBe('billing-schema')
  })
})

describe('list — npm schema entry has correct ref', () => {
  it('generates @specd/schema-name ref for npm packages', async () => {
    const pkgDir = path.join(ctx.nodeModulesPath, '@specd', 'schema-enterprise')
    await fs.mkdir(pkgDir, { recursive: true })
    await fs.writeFile(path.join(pkgDir, 'schema.yaml'), MINIMAL_SCHEMA, 'utf-8')

    const entries = await ctx.registry.list(ctx.workspaceSchemasPaths)
    expect(entries).toHaveLength(1)
    expect(entries[0]!.ref).toBe('@specd/schema-enterprise')
    expect(entries[0]!.source).toBe('npm')
    expect(entries[0]!.workspace).toBeUndefined()
  })
})

describe('list — directory without schema.yaml is skipped', () => {
  it('ignores workspace subdirectories that have no schema.yaml', async () => {
    const emptyDir = path.join(ctx.defaultSchemasPath, 'empty')
    await fs.mkdir(emptyDir, { recursive: true })
    const entries = await ctx.registry.list(ctx.workspaceSchemasPaths)
    expect(entries).toHaveLength(0)
  })
})

describe('list — missing schemas path returns empty', () => {
  it('returns no entries when the schemas path does not exist', async () => {
    const paths = new Map([['default', path.join(ctx.tmpDir, 'nonexistent')]])
    const entries = await ctx.registry.list(paths)
    expect(entries).toHaveLength(0)
  })
})

describe('resolve — workspace-qualified ref with unknown workspace', () => {
  it('throws SchemaValidationError for unknown workspace in # ref', async () => {
    await expect(
      ctx.registry.resolve('#nonexistent:my-schema', ctx.workspaceSchemasPaths),
    ).rejects.toThrow(/workspace 'nonexistent' not found/)
  })
})

describe('resolve — relative path resolves from configDir', () => {
  it('resolves ./ paths relative to configDir, not cwd', async () => {
    const schemaContent = `
name: relative-schema
version: 1
artifacts: []
`.trim()
    await fs.mkdir(path.join(ctx.tmpDir, 'custom'), { recursive: true })
    await fs.writeFile(path.join(ctx.tmpDir, 'custom', 'schema.yaml'), schemaContent, 'utf-8')

    const result = await ctx.registry.resolve('./custom/schema.yaml', ctx.workspaceSchemasPaths)
    expect(result).not.toBeNull()
    expect(result!.name()).toBe('relative-schema')
  })
})
