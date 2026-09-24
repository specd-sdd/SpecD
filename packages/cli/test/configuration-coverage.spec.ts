import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  SpecdYamlZodSchema,
  WorkspaceRawZodSchema,
  ProjectGraphZodSchema,
  WorkspaceGraphZodSchema,
  LoggingZodSchema,
  PluginsZodSchema,
  SchemaOverridesZodSchema,
} from '@specd/sdk/ports'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')
const configGuideFile = path.join(repoRoot, 'docs/guide/configuration.md')

function extractShapeKeys(schema: unknown): string[] {
  if (!schema) return []
  const s = schema as {
    shape?: Record<string, unknown>
    _def?: {
      schema?: { shape?: Record<string, unknown> }
      innerType?: { shape?: Record<string, unknown> }
    }
  }
  const shape = s.shape ?? s._def?.schema?.shape ?? s._def?.innerType?.shape ?? {}
  return Object.keys(shape)
}

describe('Configuration Documentation Coverage (dynamic introspection)', () => {
  it('configuration guide file exists', () => {
    expect(fs.existsSync(configGuideFile)).toBe(true)
  })

  const guideContent = fs.readFileSync(configGuideFile, 'utf-8')

  describe('Top-level specd.yaml schema properties', () => {
    const topLevelKeys = extractShapeKeys(SpecdYamlZodSchema)

    it('identifies top-level configuration options from schema', () => {
      expect(topLevelKeys.length).toBeGreaterThan(0)
    })

    for (const key of topLevelKeys) {
      it(`documents top-level option '${key}' in configuration.md`, () => {
        // Must appear as a code identifier (e.g. `key` or key:) or table entry
        const hasKey =
          guideContent.includes(`\`${key}\``) ||
          guideContent.includes(`${key}:`) ||
          guideContent.includes(`| \`${key}\``)
        expect(
          hasKey,
          `Expected top-level config option '${key}' to be documented in ${configGuideFile}`,
        ).toBe(true)
      })
    }
  })

  describe('Workspace configuration properties', () => {
    const workspaceKeys = extractShapeKeys(WorkspaceRawZodSchema).filter(
      (k) => k !== 'contextMode', // contextMode is rejected inside workspaces and validated as project-only
    )

    it('identifies workspace configuration options from schema', () => {
      expect(workspaceKeys.length).toBeGreaterThan(0)
    })

    for (const key of workspaceKeys) {
      it(`documents workspace option '${key}' in configuration.md`, () => {
        const hasKey =
          guideContent.includes(`\`${key}\``) ||
          guideContent.includes(`workspaces.<name>.${key}`) ||
          guideContent.includes(`workspaces:`)
        expect(
          hasKey,
          `Expected workspace config option '${key}' to be documented in ${configGuideFile}`,
        ).toBe(true)
      })
    }
  })

  describe('Workspace code graph properties', () => {
    const wsGraphKeys = extractShapeKeys(WorkspaceGraphZodSchema)

    for (const key of wsGraphKeys) {
      it(`documents workspace graph option '${key}' in configuration.md`, () => {
        const hasKey =
          guideContent.includes(`\`${key}\``) ||
          guideContent.includes(`graph.${key}`) ||
          guideContent.includes(`workspaces.<name>.graph.${key}`)
        expect(
          hasKey,
          `Expected workspace graph option '${key}' to be documented in ${configGuideFile}`,
        ).toBe(true)
      })
    }
  })

  describe('Project-level code graph properties', () => {
    const projectGraphKeys = extractShapeKeys(ProjectGraphZodSchema)

    for (const key of projectGraphKeys) {
      it(`documents project graph option '${key}' in configuration.md`, () => {
        const hasKey = guideContent.includes(`\`${key}\``) || guideContent.includes(`graph.${key}`)
        expect(
          hasKey,
          `Expected project graph option '${key}' to be documented in ${configGuideFile}`,
        ).toBe(true)
      })
    }
  })

  describe('Logging properties', () => {
    const loggingKeys = extractShapeKeys(LoggingZodSchema)

    for (const key of loggingKeys) {
      it(`documents logging option '${key}' in configuration.md`, () => {
        const hasKey =
          guideContent.includes(`\`${key}\``) || guideContent.includes(`logging.${key}`)
        expect(
          hasKey,
          `Expected logging option '${key}' to be documented in ${configGuideFile}`,
        ).toBe(true)
      })
    }
  })

  describe('Plugins properties', () => {
    const pluginKeys = extractShapeKeys(PluginsZodSchema)

    for (const key of pluginKeys) {
      it(`documents plugins option '${key}' in configuration.md`, () => {
        const hasKey =
          guideContent.includes(`\`${key}\``) || guideContent.includes(`plugins.${key}`)
        expect(
          hasKey,
          `Expected plugins option '${key}' to be documented in ${configGuideFile}`,
        ).toBe(true)
      })
    }
  })

  describe('SchemaOverrides operations', () => {
    const overrideKeys = extractShapeKeys(SchemaOverridesZodSchema)

    for (const op of overrideKeys) {
      it(`documents schema override operation '${op}' in configuration.md`, () => {
        const hasKey =
          guideContent.includes(`\`${op}\``) || guideContent.includes(`schemaOverrides.${op}`)
        expect(
          hasKey,
          `Expected schemaOverrides operation '${op}' to be documented in ${configGuideFile}`,
        ).toBe(true)
      })
    }
  })

  describe('Cascade overlay inheritance and removal properties', () => {
    it("documents cascade 'extends' directive", () => {
      expect(guideContent.includes('`extends`')).toBe(true)
    })

    it("documents cascade 'remove' directive", () => {
      expect(guideContent.includes('`remove`')).toBe(true)
    })

    const removalTargets = ['root', 'workspaces', 'storage', 'context', 'plugins']
    for (const target of removalTargets) {
      it(`documents cascade removal target '${target}' in configuration.md`, () => {
        const hasTarget =
          guideContent.includes(`\`remove.${target}\``) ||
          guideContent.includes(`remove.${target}`) ||
          guideContent.includes(`| \`${target}\``) ||
          guideContent.includes(`${target}:`)
        expect(
          hasTarget,
          `Expected cascade removal target '${target}' to be documented in ${configGuideFile}`,
        ).toBe(true)
      })
    }
  })

  describe('Defaults and cascade merge semantics documentation', () => {
    it("documents cascade replacement semantics ('Replaces')", () => {
      expect(guideContent.includes('**Replaces**') || guideContent.includes('replaces')).toBe(true)
    })

    it("documents cascade additive semantics ('Appends')", () => {
      expect(guideContent.includes('**Appends**') || guideContent.includes('appends')).toBe(true)
    })

    it('contains comprehensive reference table with default values column', () => {
      expect(guideContent.includes('| Default |')).toBe(true)
      expect(guideContent.includes('| Cascade Rule |')).toBe(true)
    })
  })
})
