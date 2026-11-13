import { InvalidSpecIdError } from '../errors/invalid-spec-id-error.js'
import { WorkspaceNotFoundError } from '../errors/workspace-not-found-error.js'
import { isValidCapabilitySegment, isValidWorkspaceName } from './spec-id-rules.js'
import { isWindowsDeviceName } from './windows-device-name.js'

/**
 * Options controlling how a spec ID string is parsed and validated.
 */
export interface ParseSpecIdOptions {
  /** Configured workspaces. When given, the workspace must be one of them. */
  readonly workspaces?: Iterable<string | { readonly name: string }>
  /** Workspace used for an ID without `:` (default `'default'`). */
  readonly defaultWorkspace?: string
}

/**
 * Fully-qualified, validated result of parsing a spec ID.
 */
export interface ParsedSpecId {
  /** Resolved workspace name. */
  readonly workspace: string
  /** Capability path (slash-separated segments). */
  readonly capPath: string
  /** Always `${workspace}:${capPath}`. */
  readonly specId: string
}

/**
 * Parses and validates a spec identifier into a fully-qualified result.
 *
 * Blank input, invalid workspace or capability-path segments, and (when
 * `workspaces` is supplied) unknown workspaces raise typed domain errors.
 *
 * @param specId - Spec identifier, e.g. `"billing:payments/checkout"` or a bare path
 * @param options - Optional default workspace and configured workspace set
 * @returns The parsed workspace, capability path, and fully-qualified `specId`
 * @throws {InvalidSpecIdError} When the ID fails syntax validation
 * @throws {WorkspaceNotFoundError} When `options.workspaces` is set and the workspace is absent
 */
export function parseSpecId(specId: string, options: ParseSpecIdOptions = {}): ParsedSpecId {
  if (specId.trim() === '') throw new InvalidSpecIdError(specId, 'must not be empty or blank')
  const colon = specId.indexOf(':')
  const explicit = colon >= 0
  const workspace = explicit ? specId.slice(0, colon) : (options.defaultWorkspace ?? 'default')
  const capPath = explicit ? specId.slice(colon + 1) : specId
  if (!isValidWorkspaceName(workspace)) {
    throw new InvalidSpecIdError(
      specId,
      `workspace '${workspace}' is invalid (use two or more of a-z, 0-9 and '-', starting with a letter, and not a Windows device name)`,
    )
  }
  if (capPath === '') throw new InvalidSpecIdError(specId, 'capability path must not be empty')
  if (capPath.includes(':')) {
    throw new InvalidSpecIdError(specId, "capability path must not contain ':'")
  }
  for (const segment of capPath.split('/')) {
    if (segment === '') {
      throw new InvalidSpecIdError(specId, 'capability path has an empty segment', segment)
    }
    if (isWindowsDeviceName(segment)) {
      throw new InvalidSpecIdError(specId, `segment '${segment}' is a Windows device name`, segment)
    }
    if (segment.includes('\\')) {
      throw new InvalidSpecIdError(
        specId,
        `segment '${segment}' contains a backslash; use '/' as the only path separator`,
        segment,
      )
    }
    if (!isValidCapabilitySegment(segment)) {
      throw new InvalidSpecIdError(
        specId,
        `segment '${segment}' is invalid (use a-z, 0-9, '_' and '-', not starting with '-')`,
        segment,
      )
    }
  }
  if (options.workspaces !== undefined) {
    const names = new Set<string>()
    for (const w of options.workspaces) names.add(typeof w === 'string' ? w : w.name)
    if (!names.has(workspace)) {
      throw new WorkspaceNotFoundError(workspace, { specId, known: [...names] })
    }
  }
  return { workspace, capPath, specId: `${workspace}:${capPath}` }
}

/**
 * True when `value` is a syntactically valid, fully-qualified (`workspace:capabilityPath`) spec ID.
 *
 * @param value - Candidate string to test
 * @returns Whether `value` includes `:` and passes `parseSpecId` without options
 */
export function isFullyQualifiedSpecId(value: string): boolean {
  if (!value.includes(':')) return false
  try {
    parseSpecId(value)
    return true
  } catch {
    return false
  }
}
