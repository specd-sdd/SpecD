import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { createDefaultConfigLoader, createKernel, type Kernel } from '@specd/core'

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = path.resolve(TEST_DIR, '..')
const SCHEMA_FILE = path.join(PKG_ROOT, 'schema.yaml')

const tempDirs: string[] = []

async function setupFixtureProject(verifyContent: string): Promise<Kernel> {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'specd-schema-std-'))
  tempDirs.push(tmpRoot)

  for (const dir of ['changes', 'drafts', 'archive', 'discarded']) {
    await mkdir(path.join(tmpRoot, '.specd', dir), { recursive: true })
  }
  await mkdir(path.join(tmpRoot, 'specs', 'sample'), { recursive: true })

  await writeFile(
    path.join(tmpRoot, 'specd.yaml'),
    [
      `schema: ${JSON.stringify(SCHEMA_FILE)}`,
      'workspaces:',
      '  default:',
      '    specs:',
      '      adapter:',
      '        type: fs',
      '        config:',
      '          path: specs',
      '    ownership: owned',
      '',
    ].join('\n'),
    'utf8',
  )

  await writeFile(
    path.join(tmpRoot, 'specs', 'sample', 'spec.md'),
    [
      '# Sample',
      '',
      '## Purpose',
      '',
      'Verify GWT list-item validation and metadata extraction.',
      '',
      '## Requirements',
      '',
      '### Requirement: Foo',
      '',
      'The system SHALL handle foo.',
      '',
    ].join('\n'),
    'utf8',
  )

  await writeFile(path.join(tmpRoot, 'specs', 'sample', 'verify.md'), verifyContent, 'utf8')

  const loader = await createDefaultConfigLoader({ configPath: path.join(tmpRoot, 'specd.yaml') })
  const config = await loader.load()
  return createKernel(config)
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe('schema-std verify GWT list-item validation & extraction', () => {
  it('passes validation and extracts populated given/when/then for GIVEN+WHEN+THEN list items (including bold)', async () => {
    const kernel = await setupFixtureProject(
      [
        '# Verification: Sample',
        '',
        '## Requirements',
        '',
        '### Requirement: Foo',
        '',
        '#### Scenario: Full GWT list',
        '',
        '- **GIVEN** an existing item',
        '- **WHEN** the user triggers foo',
        '- **THEN** the item is updated',
        '',
      ].join('\n'),
    )

    const validation = await kernel.specs.validate.execute({ specPath: 'default:sample' })
    expect(validation.passed).toBe(1)
    expect(validation.failed).toBe(0)

    const metadata = await kernel.specs.getMetadata.execute({ specId: 'default:sample' })
    const scenarios = metadata.metadata.scenarios ?? []
    expect(scenarios).toHaveLength(1)
    expect(scenarios[0]?.given).toEqual(['an existing item'])
    expect(scenarios[0]?.when).toEqual(['the user triggers foo'])
    expect(scenarios[0]?.then).toEqual(['the item is updated'])
  })

  it('passes validation and extracts when/then when optional GIVEN is omitted', async () => {
    const kernel = await setupFixtureProject(
      [
        '# Verification: Sample',
        '',
        '## Requirements',
        '',
        '### Requirement: Foo',
        '',
        '#### Scenario: No GIVEN',
        '',
        '- **WHEN** the user triggers foo',
        '- **THEN** the item is updated',
        '',
      ].join('\n'),
    )

    const validation = await kernel.specs.validate.execute({ specPath: 'default:sample' })
    expect(validation.passed).toBe(1)
    expect(validation.failed).toBe(0)

    const metadata = await kernel.specs.getMetadata.execute({ specId: 'default:sample' })
    const scenarios = metadata.metadata.scenarios ?? []
    expect(scenarios).toHaveLength(1)
    expect(scenarios[0]?.given).toBeUndefined()
    expect(scenarios[0]?.when).toEqual(['the user triggers foo'])
    expect(scenarios[0]?.then).toEqual(['the item is updated'])
  })

  it('fails structural validation when scenario body is prose without WHEN/THEN list items', async () => {
    const kernel = await setupFixtureProject(
      [
        '# Verification: Sample',
        '',
        '## Requirements',
        '',
        '### Requirement: Foo',
        '',
        '#### Scenario: Prose only',
        '',
        'When the user triggers foo, then the item is updated.',
        '',
      ].join('\n'),
    )

    const validation = await kernel.specs.validate.execute({ specPath: 'default:sample' })
    expect(validation.passed).toBe(0)
    expect(validation.failed).toBe(1)

    const failures = validation.entries[0]?.failures ?? []
    const descriptions = failures.map((failure) => failure.description).join('\n')
    expect(descriptions).toContain('^WHEN\\\\b')
    expect(descriptions).toContain('^THEN\\\\b')
  })
})
