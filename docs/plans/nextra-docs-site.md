# Nextra Documentation Site Plan

Status: split from the runtime introspection plan. Use the local
`documentation-website-for-software-project` skill. Do not use VitePress.

## Goal

Create a polished Nextra 4 App Router documentation site for configorama. The
README should remain the concise entry point; the docs site should become the
complete workflow, concept, and reference surface.

## Site Location

Create the docs app inside this repository:

```text
/Users/david/Workspace/repos/configorama/site/
```

The source repo keeps planning docs under `docs/plans/` and any generated README
snippets. The `site/` directory owns the public docs experience, build,
deployment, and docs-specific tooling.

## Framework

Use Nextra 4 App Router:

```text
site/
  app/
    layout.tsx
    _meta.global.tsx
    [[...mdxPath]]/
      page.jsx
  content/
  mdx-components.tsx
  next.config.ts
  package.json
  public/
```

Core requirements from the docs-site skill:

- App Router, not Pages Router.
- `content/` for MDX.
- `_meta.global.tsx` for sidebar/nav.
- `nextra-theme-docs`.
- Search enabled.
- Dark mode verified.
- Edit links and feedback hooks.
- Mermaid diagrams.
- Build/typecheck/link/a11y smoke gates.

## Information Architecture

Use Diátaxis. Every page should belong to exactly one category.

### Tutorials

- Get started with configorama.
- Resolve your first config.

### How-To Guides

- Inspect required inputs.
- Safely inspect an untrusted config.
- Generate a dependency graph.
- Debug a failed resolution.
- Use configorama in CI.
- Write a custom resolver.
- Use TypeScript config files.

### Concepts

- How resolution works.
- Metadata, requirements, and introspection.
- Static vs resolved dependency graphs.
- Safe mode and trust boundaries.
- Cross-format semantics.

### Reference

- CLI commands and flags.
- API reference.
- Variable sources.
- Filters and functions.
- Requirements JSON schema.
- Audit JSON schema.
- Graph JSON schema.
- Structured error codes.
- Security policies.

## Proposed Content Tree

```text
content/
  index.mdx
  tutorials/
    get-started.mdx
    first-config.mdx
  guides/
    inspect-requirements.mdx
    debug-resolution.mdx
    safe-inspection.mdx
    dependency-graphs.mdx
    use-in-ci.mdx
    custom-resolvers.mdx
    typescript-configs.mdx
  concepts/
    architecture.mdx
    resolution-model.mdx
    introspection-model.mdx
    security-model.mdx
    cross-format-semantics.mdx
  reference/
    cli.mdx
    api.mdx
    variable-sources.mdx
    filters-functions.mdx
    requirements-schema.mdx
    audit-schema.mdx
    graph-schema.mdx
    error-codes.mdx
    security-policies.mdx
  changelog.mdx
  glossary.mdx
```

## Page Quality Bar

Every non-reference page needs:

- First-three-paragraph orientation: what this is, who it is for, where it fits.
- A concrete example that can run.
- At least one pitfall/gotcha.
- Cross-links to related pages.
- A diagram where it clarifies the mental model.

Reference pages can be austere, but they must be complete and consistently
structured.

## Nextra Components To Use

- `<Steps>` for tutorials and task flows.
- `<Callout>` for security warnings, parser gotchas, and compatibility notes.
- `<Tabs>` for CLI/API and npm/yarn/bun examples.
- `<FileTree>` for fixture layouts and config examples.
- Mermaid code blocks for resolution/data-flow/graph examples.
- TSDoc integration for TypeScript API reference if stable enough.

## Scripts

Inside the docs site:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "content:lint": "node scripts/content-lint.mjs",
    "content:audit": "node scripts/audit-content.mjs",
    "link:check": "node scripts/link-check.mjs"
  }
}
```

The existing source-repo `scripts/docs.js` can remain for README generation. If
it conflicts later, rename it to `docs:generate`.

## Deployment

Default path:

1. Build locally with `next build`.
2. Run typecheck and content checks.
3. Deploy to Netlify.
4. Otherwise self-host with `next start` as a fallback.

Launch gate:

- `next build` clean.
- `tsc --noEmit` clean.
- Internal links clean.
- Playwright smoke passes.
- Dark mode works.
- Search works.
- Mermaid diagrams render.
- Edit links point to the correct GitHub path.

## Phase Plan

### Phase 1: Scaffold

Use the local docs-site skill scaffold for Nextra App Router.

Done when:

- `site/` docs app exists.
- Nextra renders a home page.
- Build succeeds.

### Phase 2: Information Architecture

Create content tree and `_meta.global.tsx`.

Done when:

- Sidebar reflects tutorials/guides/concepts/reference.
- Empty stubs are avoided or clearly marked draft-only.

### Phase 3: Core Workflow Docs

Write the highest-value guides:

- Get started.
- Inspect requirements.
- Safe inspection.
- Dependency graphs.
- Debug resolution.
- CI usage.

Done when:

- Each page has runnable examples and cross-links.

### Phase 4: Reference Docs

Write CLI/API/source/filter/schema/error reference pages.

Done when:

- Reference pages cover public behavior accurately.
- JSON schemas align with implementation.

### Phase 5: Polish And Validation

Run content lint, link check, build, typecheck, and Playwright smoke.

Done when:

- Last polish pass finds only trivial edits.
- Dark mode/search/Mermaid are verified.

### Phase 6: Deploy

Deploy or document the self-host path.

Done when:

- URL is available or self-host instructions are tested.
- README links to the docs site.

## Open Decisions

1. Should the docs site be its own package inside the repo? Recommendation: yes:
   keep it under `site/` with its own `package.json`, while the root package keeps
   the library/CLI build and release workflow.
2. Should docs pull source README via remote MDX? Recommendation: no for v1;
   copy/adapt content intentionally.
3. Should docs versioning ship in v1? Recommendation: no. Add once public schemas
   stabilize.
