import { isWindowsDeviceName } from './windows-device-name.js'

const WORKSPACE_NAME_RE = /^[a-z][a-z0-9-]+$/
const CAPABILITY_SEGMENT_RE = /^[a-z0-9_][a-z0-9_-]*$/

/**
 * True when `name` is a valid workspace name (two or more characters, never a Windows device name).
 *
 * @param name - Candidate workspace name
 * @returns Whether `name` satisfies the canonical workspace-name rule
 */
export function isValidWorkspaceName(name: string): boolean {
  return WORKSPACE_NAME_RE.test(name) && !isWindowsDeviceName(name)
}

/**
 * True when `segment` is a valid capability path segment (a folder name).
 *
 * @param segment - Candidate capability-path segment
 * @returns Whether `segment` satisfies the canonical segment rule
 */
export function isValidCapabilitySegment(segment: string): boolean {
  return CAPABILITY_SEGMENT_RE.test(segment) && !isWindowsDeviceName(segment)
}
