# Design: suppress-unresolved-template-variable-warnings

## Non-goals

- This change does NOT modify the TemplateExpander class behavior itself
- This change does NOT add any new spec requirements
- This change does NOT modify the template variable resolution logic

## Affected areas

| File / Symbol                                       | Change                                                       | Rationale                                                  |
| --------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| `packages/core/src/composition/kernel-internals.ts` | Remove callback argument from `TemplateExpander` constructor | The callback parameter is the source of the warning output |

### Symbol-level impact

The change affects a single constructor call:

- **Symbol**: `TemplateExpander` constructor in `kernel-internals.ts`
- **Location**: Line 474-476
- **Risk**: LOW — only one call site is modified
- **Callers**: None beyond this location — no downstream impact

## Approach

Remove the second argument (the callback function) from the `TemplateExpander` constructor call.

**Current code** (`kernel-internals.ts:474-476`):

```typescript
const expander = new TemplateExpander({ project: { root: config.projectRoot } }, (token) => {
  console.warn(`warning: unresolved template variable '{{${token}}}'`)
})
```

**New code**:

```typescript
const expander = new TemplateExpander({ project: { root: config.projectRoot } })
```

The `onUnknown` callback parameter in `TemplateExpander` is optional (see `template-expander.ts:53`). When not provided, unresolved tokens are silently preserved in the output without any warning.

## New constructs

_none_ — no new code constructs are added.

## Testing

### Automated tests

No new tests required — this change removes warning output, not functionality. The existing template expansion tests should continue to pass.

### Manual verification

1. Run any specd command that executes hooks (e.g., `specd change run-hooks`)
2. Verify no "warning: unresolved template variable" messages appear in output
3. Verify hooks still execute correctly (functionality unchanged)

## Trade-offs

_none_ — this is a simple removal of one callback with no trade-offs.

## Open questions

_none_
