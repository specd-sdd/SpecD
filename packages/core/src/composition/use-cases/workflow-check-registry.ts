import { type CompositionResolver } from '../composition-resolver.js'
import {
  createWorkflowCheckRegistry,
  type WorkflowCheckRegistry,
} from '../../application/checks/workflow-check-registry.js'
import { createCountTasks, resolveCountTasksDeps } from './count-tasks.js'
import { detectImplLinksInScope } from '../../application/services/detect-impl-links-in-scope.js'
import {
  detectSpecOverlap,
  specOverlapDetectionForChange,
} from '../../domain/services/detect-spec-overlap.js'
import { type Change } from '../../domain/entities/change.js'
import { type SpecOverlapDetection } from '../../application/checks/spec-overlap.js'

/**
 * Builds the composed workflow check registry for lifecycle use cases.
 *
 * @param resolver - Shared composition resolver
 * @param options - Optional archive-only overlap wiring
 * @param options.includeOverlapDetection - When true, wires peer overlap detection
 * @returns Registry with transition and archive bindings
 */
export function resolveWorkflowCheckRegistry(
  resolver: CompositionResolver,
  options: { readonly includeOverlapDetection?: boolean } = {},
): WorkflowCheckRegistry {
  const countTasks = createCountTasks(resolveCountTasksDeps(resolver))
  const changes = resolver.getChangeRepository()
  const readyFacts = {
    changes,
    listWorkspaces: resolver.getListWorkspaces(),
    parsers: resolver.getArtifactParserRegistry(),
    extractorTransforms: resolver.getExtractorTransforms(),
    workspaceRoutes: resolver.getSpecWorkspaceRoutes(),
    hasher: resolver.getContentHasher(),
  }

  let detectOverlap:
    | ((change: Change) => SpecOverlapDetection | Promise<SpecOverlapDetection>)
    | undefined
  if (options.includeOverlapDetection === true) {
    detectOverlap = async (change: Change): Promise<SpecOverlapDetection> => {
      const listed = await changes.list()
      const others: Change[] = []
      for (const entry of listed.items) {
        if (entry.name === change.name) continue
        const loaded = await changes.get(entry.name)
        if (loaded !== null) others.push(loaded)
      }
      if (others.length === 0) {
        return { blocked: false }
      }
      const report = detectSpecOverlap([...others, change])
      const detection = specOverlapDetectionForChange(change.name, report)
      if (!detection.blocked) {
        return { blocked: false }
      }
      return {
        blocked: true,
        peers: detection.peers,
      }
    }
  }

  return createWorkflowCheckRegistry({
    countTasks,
    runStepHooks: resolver.getRunStepHooks(),
    readyFacts,
    detectImplLinksInScope,
    ...(detectOverlap !== undefined ? { detectSpecOverlap: detectOverlap } : {}),
  })
}
