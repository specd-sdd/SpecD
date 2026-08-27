import { describe, expect, it } from 'vitest'
import { makeSpec } from '../../helpers/make-spec.js'
import { ResolveContextSpecs } from '../../../src/application/use-cases/resolve-context-specs.js'
import {
  CompileContext,
  type CompileContextConfig,
} from '../../../src/application/use-cases/compile-context.js'
import {
  makeChange,
  makeChangeRepository,
  makeListWorkspaces,
  makeSpecRepository,
  makeArtifactType,
  makeSchema,
  makeSchemaProvider,
  makeContentHasher,
  makeGetSpecMetadata,
  makeFileReader,
  makeStubPreviewSpec,
} from './helpers.js'

describe('configured-context helper parity (CompileContext vs ResolveContextSpecs)', () => {
  it('matches include/exclude ID sets for steps 1–4 when change seeds are disabled', async () => {
    const globalSpec = makeSpec({
      workspace: 'default',
      name: '_global/architecture',
      filenames: ['spec.md'],
    })
    const shared = makeSpec({
      workspace: 'core',
      name: 'workspace',
      filenames: ['spec.md'],
    })
    const onlyWorkspace = makeSpec({
      workspace: 'core',
      name: 'compile-context',
      filenames: ['spec.md'],
    })
    const draft = makeSpec({
      workspace: 'default',
      name: 'drafts/old',
      filenames: ['spec.md'],
    })
    // Activates `core` without being selected by include patterns / includeChangeSpecs.
    const seed = makeSpec({
      workspace: 'core',
      name: 'seed-only',
      filenames: ['spec.md'],
    })

    const repos = new Map([
      ['default', makeSpecRepository({ specs: [globalSpec, draft] })],
      ['core', makeSpecRepository({ specs: [shared, onlyWorkspace, seed] })],
    ])

    const config: CompileContextConfig = {
      contextIncludeSpecs: ['default:*', 'core:workspace'],
      contextExcludeSpecs: ['default:drafts/*'],
      workspaces: {
        core: { contextIncludeSpecs: ['workspace', 'compile-context'] },
      },
    }

    const resolveResult = await new ResolveContextSpecs(makeListWorkspaces(repos), config).execute()
    const resolveIds = new Set([
      ...resolveResult.project,
      ...Object.values(resolveResult.workspaces).flat(),
    ])

    const schema = makeSchema({ artifacts: [makeArtifactType('spec')] })
    const change = makeChange('parity-change', { specIds: ['core:seed-only'] })
    const hasher = makeContentHasher()
    const compile = new CompileContext(
      makeChangeRepository([change]),
      makeListWorkspaces(repos),
      makeSchemaProvider(schema),
      makeFileReader(),
      new Map(),
      hasher,
      makeStubPreviewSpec(),
      makeGetSpecMetadata(repos, hasher),
      new Map(),
      [],
      config,
    )

    const compileResult = await compile.execute({
      name: 'parity-change',
      step: 'designing',
      includeChangeSpecs: false,
      followDeps: false,
      contextMode: 'list',
    })
    const compileIds = new Set(compileResult.specs.map((entry) => entry.specId))

    expect([...resolveIds].sort()).toEqual([...compileIds].sort())
    expect(resolveIds.has('default:_global/architecture')).toBe(true)
    expect(resolveIds.has('core:workspace')).toBe(true)
    expect(resolveIds.has('core:compile-context')).toBe(true)
    expect(resolveIds.has('default:drafts/old')).toBe(false)
    expect(resolveIds.has('core:seed-only')).toBe(false)
  })
})
