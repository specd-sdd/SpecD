---
title: Guides Overview
description: Comprehensive guides, tutorials, and deep dives for SpecD.
sidebar_position: 1
slug: /guide
---

# SpecD Documentation Guides

Welcome to the SpecD User Guides! SpecD is a spec-driven development platform and codebase intelligence system designed to keep humans and AI agents perfectly aligned through structured specifications, explicit change lifecycles, and deterministic context compilation.

Start with [What is SpecD?](./what-is-specd.md) if you want the product in one page: what it is, what you can do with it, and how the Code Graph fits in. The sections below are the map of every guide.

---

## 1. Foundations & Philosophy

Understand why spec-driven development matters and how projects are structured:

- **[Philosophy](./philosophy.md)** — The core problem with traditional software development, why specs must come before code, and the contract between human intent and AI execution.
- **[Installation & Initialization](./installation.md)** — Installing the SpecD CLI globally or locally, system requirements, initializing projects (`specd project init`), and installing agent plugins.
- **[Getting Started Quickstart](./getting-started.md)** — A 10-minute walkthrough taking you from zero to your first verified and archived change with slash skills.
- **[Project Structure](./project-structure.md)** — The directory layout of a SpecD repository, including `specs/`, `.specd/`, workspaces, and application code.

---

## 2. Core Concepts & Lifecycle

Learn the fundamental building blocks of SpecD and how changes evolve:

- **[Specs](./specs.md)** — What a spec is, the role of `spec.md` and `verify.md`, metadata extraction, and how living specs evolve over time.
- **[Changes](./changes.md)** — The unit of work in SpecD, change manifest tracking, artifact dependency DAG, and change operations.
- **[Workflow & Lifecycle](./workflow.md)** — The complete 7-step change lifecycle (`drafting` → `designing` → `ready` → `implementing` → `verifying` → `done` → `archivable`), approval gates, and rollback states.
- **[Skills](./skills.md)** — Slash commands that guide you and the AI agent through the workflow. Covers all built-in skills (`/specd`, `/specd-new`, `/specd-design`, etc.), how they interact with the CLI, and when to use each one.
- **[Context Compilation](./context-compilation.md)** — How SpecD dynamically compiles token-optimized context blocks for AI agents using graph traversal and include/exclude patterns.

---

## 3. Codebase Intelligence & Workspaces

Scale SpecD across large codebases and leverage AST-powered graph intelligence:

- **[Code Graph & Intelligence](./code-graph.md)** — The architectural intelligence layer of SpecD: AST symbol indexing, multi-modal search (symbols, source code, specs, and documents), pre-calculated blast radius impact analysis, and architectural hotspot detection.
- **[Workspaces](./workspaces.md)** — Configuring monorepos, multi-repo coordinator setups, owned vs. read-only workspaces, and spec namespacing.

---

## 4. Schemas & Extensibility

Customize and extend artifact workflows, validation rules, and templates:

- **[Schemas Overview](./schemas.md)** — The architecture of SpecD schemas: declaring artifacts, transitions, and AI instructions.
- **[Standard Schema](./standard-schema.md)** — A deep dive into `@specd/schema-std`, the default proposal-spec-design-tasks workflow.
- **[Custom Schemas](./custom-schemas.md)** — Creating custom schemas or extending existing schemas for domain-specific workflows.
- **[Selectors](./selectors.md)** — Querying and validating markdown ASTs and structured metadata using SpecD selectors.
- **[Artifacts & Templates](./artifacts.md)** — What artifacts are, the dependency DAG, drift tracking, and template authoring.
- **[Deltas](./deltas.md)** — Non-destructive specification patching, three-way merging, and conflict resolution during archive.

---

## 5. Tooling & Reference

Command-line usage and configuration settings:

- **[CLI Reference](./cli.md)** — Command catalog for `specd guide`, `specd changes`, `specd specs`, `specd graph`, and more.
- **[Configuration Reference](./configuration.md)** — Comprehensive reference for all options available in `specd.yaml`.
- **[Configuration Examples](./configuration-examples.md)** — Practical, copy-pasteable configuration templates from single-package apps to enterprise monorepos.

---

## Need Quick Help in the CLI?

All of these guides are bundled directly into the SpecD CLI for instant, offline terminal access:

```bash
# List all available guides
specd guide

# Read a guide
specd guide specs
specd guide changes

# Search guides with BM25 full-text search
specd guide search "approval gates"
```
