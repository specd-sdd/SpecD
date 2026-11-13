import { describe, expect, it } from 'vitest'
import {
  CATALOG_OUTPUT_DIR,
  COLLECTIONS,
  REPO_ROOT,
  USER_COLLECTION,
  compileCollections,
  compileGuide,
  extractSections,
  parseFrontmatter,
} from '../../../scripts/bundle-guides.js'
import * as path from 'node:path'

describe('Bundle Script Unit Tests', () => {
  it('emits the runtime and published catalogs into the package-root generated directory', () => {
    expect(CATALOG_OUTPUT_DIR).toBe(path.join(REPO_ROOT, 'packages/guide/generated'))
    expect(CATALOG_OUTPUT_DIR).not.toContain(path.join('src', 'infrastructure', 'generated'))
  })

  describe('parseFrontmatter', () => {
    it('successfully parses valid YAML frontmatter', () => {
      const markdown = `---
title: My Title
description: "A comprehensive guide description"
sidebar_position: 5
---

# Content here
`
      const { frontmatter, body } = parseFrontmatter(markdown, 'test.md')
      expect(frontmatter.title).toBe('My Title')
      expect(frontmatter.description).toBe('A comprehensive guide description')
      expect(frontmatter.sidebar_position).toBe(5)
      expect(body.trim()).toBe('# Content here')
    })

    it('throws error when frontmatter block is missing', () => {
      const markdown = '# No frontmatter\nJust text.'
      expect(() => parseFrontmatter(markdown, 'test.md')).toThrow(/Missing YAML frontmatter block/)
    })

    it('throws error when title is missing or empty', () => {
      const markdown = `---
description: Test
sidebar_position: 1
---
`
      expect(() => parseFrontmatter(markdown, 'test.md')).toThrow(/'title' is required/)
    })

    it('throws error when description is missing or empty', () => {
      const markdown = `---
title: Test
sidebar_position: 1
---
`
      expect(() => parseFrontmatter(markdown, 'test.md')).toThrow(/'description' is required/)
    })

    it('throws error when sidebar_position is missing or not a non-negative integer', () => {
      const markdown = `---
title: Test
description: Desc
sidebar_position: -3
---
`
      expect(() => parseFrontmatter(markdown, 'test.md')).toThrow(
        /'sidebar_position' must be an integer >= 0/,
      )
    })
  })

  describe('extractSections', () => {
    it('ignores headings inside triple-backtick fenced code blocks', () => {
      const content = `# Top Level

\`\`\`bash
# This is a comment in a bash script, not a heading!
## Still a comment
\`\`\`

## Real Subheading
Body text here.`

      const sections = extractSections(content)
      expect(sections).toHaveLength(2)
      expect(sections[0]!.heading).toBe('Top Level')
      expect(sections[0]!.index).toBe(1)
      expect(sections[1]!.heading).toBe('Real Subheading')
      expect(sections[1]!.index).toBe(2)
    })

    it('assigns 1-indexed sequential indices and correct startLine/endLine', () => {
      const content = `Line 1
# Section A
Line 3
Line 4
## Section B
Line 6
Line 7
# Section C
Line 9`

      const sections = extractSections(content)
      expect(sections).toHaveLength(3)

      expect(sections[0]!.index).toBe(1)
      expect(sections[0]!.heading).toBe('Section A')
      expect(sections[0]!.startLine).toBe(2)
      expect(sections[0]!.endLine).toBe(7) // ends before Section C (equal depth level 1)

      expect(sections[1]!.index).toBe(2)
      expect(sections[1]!.heading).toBe('Section B')
      expect(sections[1]!.startLine).toBe(5)
      expect(sections[1]!.endLine).toBe(7)

      expect(sections[2]!.index).toBe(3)
      expect(sections[2]!.heading).toBe('Section C')
      expect(sections[2]!.startLine).toBe(8)
      expect(sections[2]!.endLine).toBe(9)
    })

    it('calculates exact character startOffset and endOffset matching content slices', () => {
      const content = `# Section A
Body A text.

## Section B
Body B text.

# Section C
Body C text.`

      const sections = extractSections(content)
      expect(sections).toHaveLength(3)

      expect(sections[0]!.startOffset).toBe(0)
      expect(content.slice(sections[0]!.startOffset, sections[0]!.endOffset)).toBe(
        '# Section A\nBody A text.\n\n## Section B\nBody B text.\n',
      )

      expect(content.slice(sections[1]!.startOffset, sections[1]!.endOffset)).toBe(
        '## Section B\nBody B text.\n',
      )

      expect(sections[2]!.endOffset).toBe(content.length)
      expect(content.slice(sections[2]!.startOffset, sections[2]!.endOffset)).toBe(
        '# Section C\nBody C text.',
      )
    })
  })

  describe('compileGuide', () => {
    it('assembles a full GuideTopic entity', () => {
      const content = `---
title: Full Guide
description: Desc
sidebar_position: 2
---
# Main
Content.`

      const topic = compileGuide('guide', '/path/to/my-guide.md', 'my-guide.md', content)
      expect(topic.collection).toBe('guide')
      expect(topic.topic).toBe('my-guide')
      expect(topic.sourcePath).toBe('my-guide.md')
      expect(topic.title).toBe('Full Guide')
      expect(topic.order).toBe(2)
      expect(topic.content).not.toContain('---')
      expect(topic.content).toBe('# Main\nContent.')
      expect(topic.outline).toHaveLength(1)
      expect(topic.outline[0]!.index).toBe(1)
      expect(topic.outline[0]!.startLine).toBe(1)
    })
  })

  describe('collection compilation isolation', () => {
    it('emits the user collection identically with and without SDK collections configured', () => {
      const userOnly = compileCollections([COLLECTIONS[0]!]).get(USER_COLLECTION) ?? []
      const all = compileCollections(COLLECTIONS)
      const withSdk = all.get(USER_COLLECTION) ?? []

      expect(userOnly).toEqual(withSdk)
      expect(userOnly.length).toBeGreaterThan(0)
      expect(userOnly.every((t) => t.collection === USER_COLLECTION)).toBe(true)
    })

    it('keeps the user catalog free of generated API topics', () => {
      const userOnly = compileCollections([COLLECTIONS[0]!]).get(USER_COLLECTION) ?? []
      expect(userOnly.some((t) => t.collection !== USER_COLLECTION)).toBe(false)
    })
  })
})
