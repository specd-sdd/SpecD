## 1. Implementation

- [x] 1.1 Remove console.warn callback from TemplateExpander constructor
      `packages/core/src/composition/kernel-internals.ts`:
      `TemplateExpander` constructor — remove second argument
      Approach: Change from `new TemplateExpander({...}, (token) => console.warn(...))`
      to `new TemplateExpander({...})` on line 474-476
      (Req: none — code implementation task)
