import { describe, it, expect } from 'vitest'
import { GetSpecOutline } from '../../../src/application/use-cases/get-spec-outline.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { WorkspaceNotFoundError } from '../../../src/application/errors/workspace-not-found-error.js'
import { SpecNotFoundError } from '../../../src/application/errors/spec-not-found-error.js'
import { ParserNotRegisteredError } from '../../../src/application/errors/parser-not-registered-error.js'
import {
  makeSpecRepository,
  makeSchemaProvider,
  makeSchema,
  makeArtifactType,
  makeParser,
  makeParsers,
} from './helpers.js'

function setup(
  opts: {
    specs?: Spec[]
    artifacts?: Record<string, string | null>
    artifactTypes?: ReturnType<typeof makeArtifactType>[]
    parsers?: Map<string, ReturnType<typeof makeParser>>
    workspace?: string
  } = {},
) {
  const specPath = SpecPath.parse('auth/oauth')
  const spec = opts.specs?.[0] ?? new Spec('default', specPath, ['spec.md', 'verify.md'])
  const repo = makeSpecRepository({
    specs: [spec],
    artifacts: opts.artifacts ?? {
      'auth/oauth/spec.md': '# Spec',
      'auth/oauth/verify.md': '# Verify',
    },
  })
  const specRepos = new Map([[opts.workspace ?? 'default', repo]])

  const schema = makeSchema(
    opts.artifactTypes ?? [
      makeArtifactType('specs', { scope: 'spec', output: 'spec.md' }),
      makeArtifactType('verify', { scope: 'spec', output: 'verify.md' }),
      makeArtifactType('design', { scope: 'change', output: 'design.md' }),
    ],
  )
  const schemaProvider = makeSchemaProvider(schema)

  const mdParser = makeParser({
    parse: () => ({ root: { type: 'root' } }),
  })
  const parsers = opts.parsers ?? makeParsers(mdParser)

  const uc = new GetSpecOutline(specRepos, schemaProvider, parsers)

  return { uc, specPath, schemaProvider, parsers: mdParser }
}

describe('GetSpecOutline', () => {
  describe('default resolution (no artifactId, no filename)', () => {
    it('resolves ALL spec-scoped artifacts from the schema', async () => {
      const { uc, specPath } = setup()

      const result = await uc.execute({ workspace: 'default', specPath })

      const filenames = result.map((r) => r.filename).sort()
      expect(filenames).toEqual(['spec.md', 'verify.md'])
    })

    it('skips artifacts that do not exist on disk', async () => {
      const { uc, specPath } = setup({
        artifacts: {
          'auth/oauth/spec.md': '# Spec',
        },
      })

      const result = await uc.execute({ workspace: 'default', specPath })

      expect(result).toHaveLength(1)
      expect(result[0]!.filename).toBe('spec.md')
    })
  })

  describe('resolve by artifactId', () => {
    it('resolves verify to verify.md and returns its outline', async () => {
      const { uc, specPath } = setup()

      const result = await uc.execute({ workspace: 'default', specPath, artifactId: 'verify' })

      expect(result).toHaveLength(1)
      expect(result[0]!.filename).toBe('verify.md')
    })

    it('throws when artifactId is unknown in schema', async () => {
      const { uc, specPath } = setup()

      await expect(
        uc.execute({ workspace: 'default', specPath, artifactId: 'nonexistent' }),
      ).rejects.toThrow(SpecNotFoundError)
    })

    it('throws when artifactId has non-spec scope', async () => {
      const { uc, specPath } = setup()

      await expect(
        uc.execute({ workspace: 'default', specPath, artifactId: 'design' }),
      ).rejects.toThrow("artifact 'design' has scope 'change' (must be 'spec')")
    })
  })

  describe('resolve by filename', () => {
    it('uses the filename directly', async () => {
      const { uc, specPath } = setup({
        artifacts: {
          'auth/oauth/spec.md': '# Spec',
          'auth/oauth/custom.md': '# Custom',
        },
      })

      const result = await uc.execute({ workspace: 'default', specPath, filename: 'custom.md' })

      expect(result).toHaveLength(1)
      expect(result[0]!.filename).toBe('custom.md')
    })
  })

  describe('deduplication', () => {
    it('deduplicates when artifactId and filename resolve to same file', async () => {
      const { uc, specPath } = setup()

      const result = await uc.execute({
        workspace: 'default',
        specPath,
        artifactId: 'specs',
        filename: 'spec.md',
      })

      expect(result).toHaveLength(1)
      expect(result[0]!.filename).toBe('spec.md')
    })

    it('returns both when artifactId and filename resolve to different files', async () => {
      const { uc, specPath } = setup()

      const result = await uc.execute({
        workspace: 'default',
        specPath,
        artifactId: 'verify',
        filename: 'spec.md',
      })

      expect(result).toHaveLength(2)
      const filenames = result.map((r) => r.filename).sort()
      expect(filenames).toEqual(['spec.md', 'verify.md'])
    })
  })

  describe('parser selection', () => {
    it('uses the correct parser for the file extension', async () => {
      const mdOutline = [{ type: 'section', label: 'Heading', depth: 0 }]
      const mdParser = makeParser()
      const parsers = new Map([
        ['markdown', { ...mdParser, outline: () => mdOutline }],
      ]) as unknown as Map<string, ReturnType<typeof makeParser>>
      const { uc, specPath } = setup({ parsers })

      const result = await uc.execute({ workspace: 'default', specPath })

      expect(result.length).toBeGreaterThanOrEqual(1)
      expect(result[0]!.outline).toEqual(mdOutline)
    })

    it('throws when no parser is registered for the format', async () => {
      const emptyParsers = new Map() as unknown as Map<string, ReturnType<typeof makeParser>>
      const { uc, specPath } = setup({ parsers: emptyParsers })

      await expect(uc.execute({ workspace: 'default', specPath })).rejects.toThrow(
        ParserNotRegisteredError,
      )
    })

    it('throws when file extension is unrecognised', async () => {
      const specPath = SpecPath.parse('auth/oauth')
      const spec = new Spec('default', specPath, ['data.xyz'])
      const repo = makeSpecRepository({
        specs: [spec],
        artifacts: { 'auth/oauth/data.xyz': 'content' },
      })
      const specRepos = new Map([['default', repo]])
      const schema = makeSchema([makeArtifactType('specs', { scope: 'spec', output: 'spec.md' })])
      const uc = new GetSpecOutline(specRepos, makeSchemaProvider(schema), makeParsers())

      await expect(
        uc.execute({ workspace: 'default', specPath, filename: 'data.xyz' }),
      ).rejects.toThrow(ParserNotRegisteredError)
    })
  })

  describe('error paths', () => {
    it('throws WorkspaceNotFoundError when workspace does not exist', async () => {
      const { uc, specPath } = setup()

      await expect(uc.execute({ workspace: 'unknown', specPath })).rejects.toThrow(
        WorkspaceNotFoundError,
      )
    })

    it('throws SpecNotFoundError when spec does not exist', async () => {
      const specPath = SpecPath.parse('nonexistent/path')
      const repo = makeSpecRepository({ specs: [] })
      const specRepos = new Map([['default', repo]])
      const schema = makeSchema()
      const uc = new GetSpecOutline(specRepos, makeSchemaProvider(schema), makeParsers())

      await expect(uc.execute({ workspace: 'default', specPath })).rejects.toThrow(
        SpecNotFoundError,
      )
    })

    it('throws when explicit --file not found on disk', async () => {
      const { uc, specPath } = setup()

      await expect(
        uc.execute({ workspace: 'default', specPath, filename: 'non-existent.md' }),
      ).rejects.toThrow("file 'non-existent.md' not found")
    })

    it('throws when explicit --artifact file not found on disk', async () => {
      const { uc, specPath } = setup({
        artifacts: {},
      })

      await expect(
        uc.execute({ workspace: 'default', specPath, artifactId: 'specs' }),
      ).rejects.toThrow("file 'spec.md' not found")
    })
  })

  describe('result structure', () => {
    it('returns filename and outline for each resolved artifact', async () => {
      const outline = [
        { type: 'section', label: 'Purpose', depth: 0 },
        {
          type: 'section',
          label: 'Requirements',
          depth: 0,
          children: [{ type: 'section', label: 'Req 1', depth: 1 }],
        },
      ]
      const mdParser = makeParser()
      const parsers = new Map([
        ['markdown', { ...mdParser, outline: () => outline }],
      ]) as unknown as Map<string, ReturnType<typeof makeParser>>
      const { uc, specPath } = setup({ parsers })

      const result = await uc.execute({ workspace: 'default', specPath })

      expect(result).toEqual([
        { filename: 'spec.md', outline },
        { filename: 'verify.md', outline },
      ])
    })
  })
})
