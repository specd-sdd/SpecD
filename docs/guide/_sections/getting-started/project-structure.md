## Project structure on disk

A specd project has a predictable layout:

```
my-project/
├── specd.yaml                 # Project configuration
├── specs/                     # Your spec documents
│   ├── auth/
│   │   ├── login/
│   │   │   ├── spec.md
│   │   │   └── verify.md
│   │   └── oauth/
│   │       ├── spec.md
│   │       └── verify.md
│   └── _global/
│       └── architecture/
│           ├── spec.md
│           └── verify.md
├── .specd/
│   ├── changes/               # Active work
│   ├── drafts/                # Paused work
│   ├── discarded/             # Abandoned work
│   ├── archive/               # Completed work
│   └── metadata/              # Extracted spec metadata
└── src/                       # Your application code
```

The `specs/` directory holds your specifications. The `.specd/` directory is managed by specd and holds all change state. Your application code sits alongside both — specd does not impose any structure on it.

When using the built-in agent skill packages, install-time template sources live in
`packages/skills/templates/` inside the specd workspace and use the `.md.tpl`
extension. See `docs/guide/skills-template-rendering.md` for the authoring model.
