import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildSchema, createSchemaRegistry, type SchemaYamlData } from '@specd/core'

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = path.resolve(TEST_DIR, '..')
const SCHEMA_FILE = path.join(PKG_ROOT, 'schema.yaml')

async function loadRawAndTemplates(): Promise<{
  data: SchemaYamlData
  templates: ReadonlyMap<string, string>
}> {
  const registry = createSchemaRegistry('fs', {
    nodeModulesPaths: [],
    configDir: PKG_ROOT,
    schemaRepositories: new Map(),
  })
  const resolved = await registry.resolveRaw(SCHEMA_FILE)
  if (!resolved) {
    throw new Error(`Failed to resolve ${SCHEMA_FILE}`)
  }
  return { data: resolved.data, templates: resolved.templates }
}

async function loadRawSchema(): Promise<SchemaYamlData> {
  const { data } = await loadRawAndTemplates()
  return data
}

describe('schema-std:standard-schema', () => {
  it('Requirement: Canonical Schema Definition — parses root properties and compiles cleanly with buildSchema', async () => {
    const { data: raw, templates } = await loadRawAndTemplates()
    expect(raw.name).toBe('schema-std')
    expect(Number.isInteger(raw.version)).toBe(true)
    expect(raw.version).toBe(1)
    expect(Array.isArray(raw.artifacts)).toBe(true)
    expect(Array.isArray(raw.workflow)).toBe(true)

    const schema = buildSchema('schema-std', raw, templates)
    expect(schema.name()).toBe('schema-std')
    expect(schema.version()).toBe(1)
  })

  it('Requirement: Artifact Dependency Graph (DAG) Invariants — enforces prerequisite chain and resolves without cycles', async () => {
    const { data: raw, templates } = await loadRawAndTemplates()
    const schema = buildSchema('schema-std', raw, templates)

    const byId = new Map((raw.artifacts ?? []).map((artifact) => [artifact.id, artifact]))
    expect(byId.get('proposal')?.requires ?? []).toEqual([])
    expect(byId.get('specs')?.requires).toEqual(['proposal'])
    expect(byId.get('verify')?.requires).toEqual(['specs'])
    expect(byId.get('design')?.requires).toEqual(['proposal', 'specs', 'verify'])
    expect(byId.get('tasks')?.requires).toEqual(['specs', 'verify', 'design'])
    expect(byId.get('tasks')?.hasTasks).toBe(true)

    const order = schema.artifacts().map((artifact) => artifact.id)
    expect(order.indexOf('proposal')).toBeLessThan(order.indexOf('specs'))
    expect(order.indexOf('specs')).toBeLessThan(order.indexOf('verify'))
    expect(order.indexOf('verify')).toBeLessThan(order.indexOf('design'))
    expect(order.indexOf('design')).toBeLessThan(order.indexOf('tasks'))
  })

  it('Requirement: Proposal Artifact Contract and Instructions — enforces scoping sections and post-rules', async () => {
    const raw = await loadRawSchema()
    const proposal = (raw.artifacts ?? []).find((artifact) => artifact.id === 'proposal')
    expect(proposal).toBeDefined()
    for (const section of [
      'Motivation',
      'Current behaviour',
      'Proposed solution',
      'Specs affected',
      'Impact',
      'Technical context',
      'Open questions',
    ]) {
      expect(proposal?.instruction).toContain(section)
    }

    const postRuleIds = proposal?.rules?.post?.map((rule) => rule.id) ?? []
    expect(postRuleIds).toContain('resolve-open-questions')
    expect(postRuleIds).toContain('register-spec-deps')
  })

  it('Requirement: Specs Artifact Contract, Instructions, and Deltas — configures requirements structure, validations, and deltas', async () => {
    const raw = await loadRawSchema()
    const specs = (raw.artifacts ?? []).find((artifact) => artifact.id === 'specs')
    expect(specs).toBeDefined()
    expect(specs?.delta).toBe(true)
    expect(specs?.deltaInstruction).toBeTruthy()

    const hasRequirements = specs?.validations?.find((rule) => rule.id === 'has-requirements')
    expect(hasRequirements?.matches).toBe('^Requirements$')
    expect(hasRequirements?.children?.some((child) => child.id === 'has-requirement-block')).toBe(
      true,
    )

    const postRuleIds = specs?.rules?.post?.map((rule) => rule.id) ?? []
    expect(postRuleIds).toContain('proposal-specs-coverage')
  })

  it('Requirement: Verify Artifact Contract, Instructions, and Deltas — enforces Scenario GWT list items, optional GIVEN, clarified instruction, and delta validations', async () => {
    const raw = await loadRawSchema()
    const verify = (raw.artifacts ?? []).find((artifact) => artifact.id === 'verify')
    expect(verify).toBeDefined()
    expect(verify?.delta).toBe(true)
    expect(verify?.instruction).toContain('“Never bullets” applies only to scenario')
    expect(verify?.instruction).toContain('GWT clauses MUST be list items')

    const hasRequirements = verify?.validations?.find((rule) => rule.id === 'has-requirements')
    const hasRequirementBlock = hasRequirements?.children?.find(
      (rule) => rule.id === 'has-requirement-block',
    )
    const hasScenario = hasRequirementBlock?.children?.find((rule) => rule.id === 'has-scenario')
    expect(hasScenario).toBeDefined()

    const scenarioChildren = hasScenario?.children ?? []
    const hasWhen = scenarioChildren.find((rule) => rule.id === 'has-when')
    const hasThen = scenarioChildren.find((rule) => rule.id === 'has-then')
    const hasGiven = scenarioChildren.find((rule) => rule.id === 'has-given')

    expect(hasWhen).toMatchObject({
      type: 'list-item',
      matches: '^WHEN\\b',
      required: true,
      count: { min: 1 },
    })
    expect(hasThen).toMatchObject({
      type: 'list-item',
      matches: '^THEN\\b',
      required: true,
      count: { min: 1 },
    })
    expect(hasGiven).toMatchObject({ type: 'list-item', matches: '^GIVEN\\b', required: false })

    const deltaRuleIds = verify?.deltaValidations?.map((rule) => rule.id) ?? []
    expect(deltaRuleIds).toContain('verify-requirement-delta-has-scenario')

    const postRuleIds = verify?.rules?.post?.map((rule) => rule.id) ?? []
    expect(postRuleIds).toContain('specs-verify-coverage')
  })

  it('Requirement: Design Artifact Contract and Instructions — enforces complete implementation blueprint and post-rules', async () => {
    const raw = await loadRawSchema()
    const design = (raw.artifacts ?? []).find((artifact) => artifact.id === 'design')
    expect(design).toBeDefined()
    for (const section of [
      'Affected areas',
      'New constructs',
      'Data models',
      'Approach',
      'Error handling',
      'Key decisions',
      'Trade-offs',
      'Spec impact',
      'Dependency map',
      'Testing',
      'Open questions',
    ]) {
      expect(design?.instruction).toContain(section)
    }

    const postRuleIds = design?.rules?.post?.map((rule) => rule.id) ?? []
    expect(postRuleIds).toContain('specs-design-coverage')
    expect(postRuleIds).toContain('resolve-open-questions')
  })

  it('Requirement: Tasks Artifact Contract, Instructions, and Tracking — configures checklist breakdown and progress tracking', async () => {
    const raw = await loadRawSchema()
    const tasks = (raw.artifacts ?? []).find((artifact) => artifact.id === 'tasks')
    expect(tasks).toBeDefined()
    expect(tasks?.hasTasks).toBe(true)
    expect(tasks?.preHashCleanup).toBeDefined()
    expect(tasks?.taskCompletionCheck).toBeDefined()
    expect(tasks?.instruction).toContain('Approach:')
  })

  it('Requirement: Cross-Artifact Validations and Parity Rules — declares specs-verify-requirement-parity', async () => {
    const raw = await loadRawSchema()
    const rule = raw.crossArtifactValidations?.find(
      (entry) => entry.id === 'specs-verify-requirement-parity',
    )
    expect(rule).toBeDefined()
    expect(rule?.participants.map((participant) => participant.artifact)).toEqual([
      'specs',
      'verify',
    ])
  })

  it('Requirement: Metadata Extraction Rules — configures extractors for title, description, dependsOn, rules, constraints, scenarios, and context', async () => {
    const raw = await loadRawSchema()
    const extraction = raw.metadataExtraction
    expect(extraction?.title).toBeDefined()
    expect(extraction?.description).toBeDefined()
    expect(extraction?.dependsOn).toBeDefined()
    expect(extraction?.rules?.some((entry) => entry.id === 'spec-requirements')).toBe(true)
    expect(extraction?.constraints?.some((entry) => entry.id === 'spec-constraints')).toBe(true)
    expect(extraction?.scenarios?.some((entry) => entry.id === 'verify-scenarios')).toBe(true)
    expect(extraction?.context?.some((entry) => entry.id === 'spec-overview')).toBe(true)
  })

  it('Requirement: Lifecycle Steps and State Transitions — defines standard workflow steps and valid transitions', async () => {
    const raw = await loadRawSchema()
    const stepNames = new Set(raw.workflow?.map((step) => step.step) ?? [])
    for (const expectedStep of ['designing', 'ready', 'implementing', 'verifying', 'archiving']) {
      expect(stepNames.has(expectedStep)).toBe(true)
    }
  })

  it('Requirement: Schema Package Distribution — exposes schema.yaml and templates/ directly without build compilation', async () => {
    const pkgRaw = await readFile(path.join(PKG_ROOT, 'package.json'), 'utf8')
    const pkg = JSON.parse(pkgRaw) as { files?: string[]; dependencies?: Record<string, string> }
    expect(pkg.files).toEqual(['schema.yaml', 'templates/'])
    expect(pkg.dependencies).toBeUndefined()
  })
})
