# Proposal: suppress-unresolved-template-variable-warnings

## Motivation

The console displays warning messages when template variables like `{{variable}}` cannot be resolved during hook execution. These warnings create unnecessary noise in the CLI output, especially when the absence of variables is intentional behavior rather than an error condition.

## Current behaviour

When template expansion occurs in hooks and a variable token cannot be resolved, the system outputs a warning to the console:

```
warning: unresolved template variable '{{token}}'
```

This is defined in `packages/core/src/composition/kernel-internals.ts` where a callback is passed to `TemplateExpander`:

```typescript
const expander = new TemplateExpander({ project: { root: config.projectRoot } }, (token) => {
  console.warn(`warning: unresolved template variable '{{${token}}}'`)
})
```

## Proposed solution

Remove the `console.warn` callback that gets invoked when template variables cannot be resolved. The `TemplateExpander` class accepts an optional `onUnknown` callback - passing `undefined` instead will silently preserve unresolved tokens without emitting warnings.

## Specs affected

### New specs

_none_ — this change does not introduce new specifications.

### Modified specs

_none_ — no existing specs are modified by this change.

## Impact

- **Code area affected**: `packages/core/src/composition/kernel-internals.ts` (line 474-476)
- **Class modified**: `TemplateExpander` in `packages/core/src/application/template-expander.ts`
- **User-facing**: No more console warnings for unresolved template variables in hooks

## Technical context

The `TemplateExpander` class in `packages/core/src/application/template-expander.ts` accepts an optional `onUnknown` callback that is invoked when a token cannot be resolved. The callback is optional - when not provided, unresolved tokens are simply preserved in the output without any warning.

The fix is a one-line change: remove the callback argument in the `TemplateExpander` constructor call in `kernel-internals.ts`.

## Open questions

_none_
