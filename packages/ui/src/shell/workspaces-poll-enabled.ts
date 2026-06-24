export type WorkspacesPollCenterKind =
  | 'change'
  | 'spec'
  | 'changes-hub'
  | 'workspaces-hub'
  | 'graph'
  | 'empty'

/** Whether workspace spec tree hooks should poll (ShellLayout gating). */
export function isWorkspacesPollEnabled(
  sidebarCollapsed: boolean,
  centerCtxKind: WorkspacesPollCenterKind,
): boolean {
  return !sidebarCollapsed || centerCtxKind === 'workspaces-hub' || centerCtxKind === 'spec'
}
