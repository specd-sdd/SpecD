# Audit Report: CLI Commands (Partial)

## Specs Audited

- `cli:change-context`
- `cli:project-context`
- `cli:spec-update-metadata`
- `cli:project-update-metadata`
- `cli:project-metadata`

## Summary of Findings

The CLI implementation for LLM-optimized metadata is highly compliant following recent refinements. The commands correctly delegate to the kernel and handle the new optimization-specific behavior.

### Requirements Verification

| Spec                          | Requirement                     | Status  | Verification                                                                |
| ----------------------------- | ------------------------------- | ------- | --------------------------------------------------------------------------- |
| `cli:change-context`          | Implementation tracking refresh | ✅ Pass | `context.ts` calls `RefreshImplementationTracking` before `CompileContext`. |
| `cli:change-context`          | Fingerprinting                  | ✅ Pass | Correctly forwards and handles fingerprint from kernel.                     |
| `cli:change-context`          | Optimization warnings           | ✅ Pass | Emits warnings from kernel (including spec-level missing optimizations).    |
| `cli:project-context`         | Project optimization warnings   | ✅ Pass | Emits warnings when project metadata is missing or stale.                   |
| `cli:spec-update-metadata`    | Standardized --file flag        | ✅ Pass | Command uses `--file` to read partial payload.                              |
| `cli:project-update-metadata` | Standardized --file flag        | ✅ Pass | Command uses `--file` to read optimized project context.                    |
| `cli:project-metadata`        | Display full structure          | ✅ Pass | Prints version, generated, and freshness hashes.                            |

### Implementation Details

- **Warnings**: All optimization warnings are correctly routed to `stderr` with remediation instructions included in the core-generated messages.
- **Flags**: Both metadata update commands have been updated to use `--file` instead of `--input` to match the specifications.
- **Delegation**: Commands cleanly delegate to `UpdateSpecMetadata` and `UpdateProjectMetadata` use cases.

## Test Coverage

### Automated Tests

- `packages/cli/test/commands/change-context.spec.ts`: Verifies fingerprinting, refresh, and formatting.
- `packages/cli/test/commands/project-context.spec.ts`: Verifies project-level context assembly.

### Manual Verification

- Manual execution of `specd change context` and `specd project context` confirms that `stderr` warnings include remediation instructions (e.g., "Run specd-spec-metadata skill to refresh").
- Help output verified for `--file` flag presence.

## Conclusion

The CLI layer is fully compliant with the latest requirements. The refined implementation ensures consistent flag naming and clear, actionable feedback for agents regarding optimization state.
