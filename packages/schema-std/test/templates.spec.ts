import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = path.resolve(TEST_DIR, '../templates')

async function readTemplate(name: string): Promise<string> {
  return readFile(path.join(TEMPLATES_DIR, name), 'utf8')
}

describe('schema-std:templates', () => {
  it('Requirement: Proposal Template Structure and Guidance — provides required sections and guidance comments', async () => {
    const content = await readTemplate('proposal.md')
    for (const heading of [
      '## Motivation',
      '## Current behaviour',
      '## Proposed solution',
      '## Specs affected',
      '## Impact',
      '## Technical context',
      '## Open questions',
    ]) {
      expect(content).toContain(heading)
    }
    expect(content).toMatch(/<!--[\s\S]*?-->/)
  })

  it('Requirement: Specs Template Structure and Guidance — defines normative requirements layout', async () => {
    const content = await readTemplate('spec.md')
    for (const heading of [
      '## Purpose',
      '## Requirements',
      '## Constraints',
      '## Spec Dependencies',
    ]) {
      expect(content).toContain(heading)
    }
    expect(content).toContain('### Requirement:')
    expect(content).toMatch(/SHALL|MUST/)
  })

  it('Requirement: Verify Template Structure and Guidance — provides Gherkin scenario list scaffolding', async () => {
    const content = await readTemplate('verify.md')
    expect(content).toContain('### Requirement:')
    expect(content).toContain('#### Scenario:')
    expect(content).toMatch(/-\s+\*\*GIVEN\*\*/)
    expect(content).toMatch(/-\s+\*\*WHEN\*\*/)
    expect(content).toMatch(/-\s+\*\*THEN\*\*/)
    expect(content).toMatch(/AND|OR/)
  })

  it('Requirement: Design Template Structure and Guidance — enforces self-contained implementation blueprint', async () => {
    const content = await readTemplate('design.md')
    for (const heading of [
      '## Affected areas',
      '## New constructs',
      '## Data models',
      '## Approach',
      '## Error handling',
      '## Key decisions',
      '## Trade-offs',
      '## Spec impact',
      '## Dependency map',
      '## Migration',
      '## Testing',
      '## Open questions',
    ]) {
      expect(content).toContain(heading)
    }
    expect(content).toMatch(/<!--[\s\S]*?-->/)
  })

  it('Requirement: Tasks Template Structure and Guidance — defines task checklist format', async () => {
    const content = await readTemplate('tasks.md')
    expect(content).toMatch(/- \[ \] /)
    expect(content).toContain('Approach:')
    expect(content).toContain('(Req:')
  })

  it('Requirement: Scaffolding Placeholders and Guidance Invariants — uses valid {{variable}} and HTML comment syntax across all templates', async () => {
    const entries = await readdir(TEMPLATES_DIR)
    const mdFiles = entries.filter((entry) => entry.endsWith('.md'))
    expect(mdFiles.sort()).toEqual(['design.md', 'proposal.md', 'spec.md', 'tasks.md', 'verify.md'])

    for (const file of mdFiles) {
      const content = await readTemplate(file)
      // Every opened HTML comment must be closed
      const opens = content.match(/<!--/g)?.length ?? 0
      const closes = content.match(/-->/g)?.length ?? 0
      expect(opens).toBe(closes)

      // No unclosed template mustache braces
      const stripped = content.replace(/\{\{[^{}]+\}\}/g, '')
      expect(stripped).not.toContain('{{')
      expect(stripped).not.toContain('}}')
    }
  })
})
