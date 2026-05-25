# Vite Host

## Purpose

Browser host for standalone Studio — **Vite Host**. Does not load a project kernel; users supply an API base URL and optional token before the shared `@specd/ui` IDE mounts.

## Requirements

### Requirement: package exposes standard vite scripts

`@specd/studio-web` MUST provide `dev`, `build`, and `preview` scripts that bundle the renderer importing `@specd/ui`.

### Requirement: host does not bootstrap a Specd kernel

The Vite host MUST NOT load `specd.yaml`, MUST NOT call `createKernel`, and MUST NOT start an API process — connection is always user-provided.

## Spec Dependencies

_none_
