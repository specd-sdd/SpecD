# plugin-agent-codex:plugin-agent

## Purpose

Codex agent plugin stub. Provides the interface structure for future full implementation.

## Requirements

### Requirement: Factory export

The package MUST export `create(): AgentPlugin` as default or named export.

### Requirement: Placeholder implementation

This is a stub for phase 2. The implementation MUST return a valid `AgentPlugin` that:

- Has `type: 'agent'`
- Has a descriptive name and version
- Has an empty or minimal `configSchema`

### Requirement: Future expansion

When implemented in phase 2:

- Will depend on `skills:skill-repository` for skill access
- Will install to the appropriate Codex skills directory
- Will inject Codex-specific metadata during install

## Constraints

- This is a placeholder/stub for phase 1.
- Full implementation is deferred to phase 2.

## Spec Dependencies

- [`plugin-manager:agent-plugin-type`](../plugin-manager/agent-plugin-type/spec.md) — plugin interface
