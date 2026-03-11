/**
 * Re-exports from the consolidated domain selector matching service.
 *
 * Application-layer consumers should import from here for convenience;
 * the actual implementation lives in `domain/services/selector-matching.ts`.
 */
export {
  findNodes,
  nodeMatches,
  nodeMatches as selectorMatches,
  collectAll,
} from '../../../domain/services/selector-matching.js'
