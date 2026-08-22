# Ladybug Graph Store

## Purpose

**Retired from this repository.** Ladybug graph-store implementation, native integration, tests, and normative requirements move to `ladybug:graph-store` in the independent `specd-plugin-graphstore-ladybug` repository/package. That repository reads its `default`, `code-graph`, and `core` dependencies through external `readOnly` workspaces. This tombstone records the ownership transfer; it does not define a built-in backend or compatibility contract for `@specd/code-graph`.

## Requirements

### Requirement: Ladybug ownership transferred

`@specd/code-graph` MUST NOT ship, register, initialize, or test a built-in Ladybug graph-store backend. Ladybug-specific requirements MUST be owned and verified as `ladybug:graph-store` by `specd-plugin-graphstore-ladybug` before their counterparts are removed from this repository. The successor spec MAY and SHOULD retain dependencies on read-only specs in this repository.

## Spec Dependencies

_none_
