import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as corePublic from '../src/public.js'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Every kernel-mounted use case and its public assembly export on `"."`.
 * Values are factory function names.
 */
const KERNEL_ASSEMBLY_EXPORTS: Record<string, string> = {
  'changes.create': 'createCreateChange',
  'changes.status': 'createGetStatus',
  'changes.transition': 'createTransitionChange',
  'changes.draft': 'createDraftChange',
  'changes.restore': 'createRestoreChange',
  'changes.discard': 'createDiscardChange',
  'changes.archive': 'createArchiveChange',
  'changes.validate': 'createValidateArtifacts',
  'changes.compile': 'createCompileContext',
  'changes.list': 'createListChanges',
  'changes.listDrafts': 'createListDrafts',
  'changes.getDraft': 'createGetDraft',
  'changes.listDiscarded': 'createListDiscarded',
  'changes.getDiscarded': 'createGetDiscarded',
  'changes.edit': 'createEditChange',
  'changes.invalidate': 'createInvalidateChange',
  'changes.skipArtifact': 'createSkipArtifact',
  'changes.updateSpecDeps': 'createUpdateSpecDeps',
  'changes.listArchived': 'createListArchived',
  'changes.getArchived': 'createGetArchivedChange',
  'changes.runStepHooks': 'createRunStepHooks',
  'changes.getHookInstructions': 'createGetHookInstructions',
  'changes.getArtifactInstruction': 'createGetArtifactInstruction',
  'changes.updateImplementationTracking': 'createUpdateImplementationTracking',
  'changes.refreshImplementationTracking': 'createRefreshImplementationTracking',
  'changes.getImplementationReview': 'createGetImplementationReview',
  'changes.detectOverlap': 'createDetectOverlap',
  'changes.preview': 'createPreviewSpec',
  'changes.approveSpec': 'createApproveSpec',
  'changes.approveSignoff': 'createApproveSignoff',
  'changes.getArtifact': 'createGetChangeArtifact',
  'changes.getReadOnlyChangeArtifact': 'createGetReadOnlyChangeArtifact',
  'changes.saveArtifact': 'createSaveChangeArtifact',
  'changes.validateBatch': 'createValidateChangeBatch',
  'changes.outlineArtifact': 'createOutlineChangeArtifact',
  'specs.list': 'createListSpecs',
  'specs.search': 'createSearchSpecs',
  'specs.get': 'createGetSpec',
  'specs.getOutline': 'createGetSpecOutline',
  'specs.saveMetadata': 'createSaveSpecMetadata',
  'specs.invalidateMetadata': 'createInvalidateSpecMetadata',
  'specs.getActiveSchema': 'createGetActiveSchema',
  'specs.resolve': 'createResolveSchema',
  'specs.validateSchema': 'createValidateSchema',
  'specs.validate': 'createValidateSpecs',
  'specs.generateMetadata': 'createGenerateSpecMetadata',
  'specs.updateMetadata': 'createUpdateSpecMetadata',
  'specs.getContext': 'createGetSpecContext',
  'project.listWorkspaces': 'createListWorkspaces',
  'project.getProjectSummary': 'createGetProjectSummary',
  'project.getProjectContext': 'createGetProjectContext',
  'project.getConfig': 'createGetConfig',
  'project.getMetadata': 'createGetProjectMetadata',
  'project.updateMetadata': 'createUpdateProjectMetadata',
}

function extractNamespaceKeys(namespace: string): string[] {
  const kernelSource = readFileSync(join(packageRoot, 'src/composition/kernel.ts'), 'utf8')
  const block = kernelSource.match(new RegExp(`${namespace}: \\{([\\s\\S]*?)\\n  \\}`, 'm'))?.[1]
  if (!block) return []
  return [...block.matchAll(/^\s{4}(\w+):/gm)].map((match) => match[1]!)
}

describe('@specd/core kernel-equivalent public coverage', () => {
  it('exports a factory or class for every kernel-mounted use case', () => {
    const missing: string[] = []

    for (const namespace of ['changes', 'specs', 'project'] as const) {
      for (const key of extractNamespaceKeys(namespace)) {
        if (key === 'repo' || key === 'repos') continue
        const mount = `${namespace}.${key}`
        const exportName = KERNEL_ASSEMBLY_EXPORTS[mount]
        const value = exportName ? (corePublic as Record<string, unknown>)[exportName] : undefined
        const isPresent =
          typeof value === 'function' ||
          (exportName !== undefined && exportName in corePublic && typeof value !== 'undefined')

        if (!exportName || !isPresent) {
          missing.push(`${mount} -> ${exportName ?? 'unmapped'}`)
        }
      }
    }

    expect(missing, `Missing public assembly exports:\n${missing.join('\n')}`).toEqual([])
  })

  it('exports create* factories for all kernel assembly exports', () => {
    const nonFactoryExports: string[] = []

    for (const [mount, exportName] of Object.entries(KERNEL_ASSEMBLY_EXPORTS)) {
      if (!exportName.startsWith('create')) {
        nonFactoryExports.push(`${mount} -> ${exportName}`)
      }
    }

    expect(
      nonFactoryExports,
      `Kernel assembly exports must be create* factories:\n${nonFactoryExports.join('\n')}`,
    ).toEqual([])
  })

  it('exports repository factories for kernel repo mounts', () => {
    expect(typeof corePublic.createChangeRepository).toBe('function')
    expect(typeof corePublic.createSpecRepository).toBe('function')
    expect(typeof corePublic.createArchiveRepository).toBe('function')
    expect(typeof corePublic.createSchemaRegistry).toBe('function')
  })
})
