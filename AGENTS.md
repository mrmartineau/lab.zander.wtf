# AGENTS.md

Guidance for AI agents working in this repo.

## What this is

`lab.zander.wtf` — a personal lab site hosting **experiments, little tools and
demos**. Built with [Astro](https://astro.build) (static output). The homepage
lists every lab item; each item is its own page with a bespoke design.

## Project structure

```
src/
  data/lab.ts            Lab item types + discovery helper (no manual registry)
  layouts/Layout.astro   Minimal shell — ZUI CSS + Phosphor icons + body reset
  pages/
    index.astro          Homepage — globs pages and reads their frontmatter
    <slug>/index.astro   One directory per lab item, named by its slug
```

## Adding a lab item

1. Create a directory `src/pages/<slug>/` with an `index.astro` (or `index.md`)
   inside, plus any supporting files — components, assets, etc.
2. Declare the item's metadata in that page's frontmatter (see below).

That's it — **no central registry to edit**. The homepage globs
`src/pages/<slug>/index.{astro,md}`, derives the slug from the directory name,
and reads each page's frontmatter. URL is `/<slug>`. List is sorted
newest-first by `date`.

### Frontmatter metadata

In an **`.astro`** page, expose metadata as module-level `export const` in the
frontmatter fence:

```astro
---
import Layout from '../../layouts/Layout.astro'

export const title = 'My experiment'
export const description = 'What it does.'
export const date = '2026-05-19'
export const status = 'live'
export const tags = ['demo']
---
```

In an **`.md`** page, put the same keys in the YAML frontmatter block.

| Field         | Required | Notes                                          |
| ------------- | -------- | ---------------------------------------------- |
| `title`       | no\*     | Display name — falls back to the slug          |
| `description` | no       | One-line summary                               |
| `date`        | no\*     | ISO `YYYY-MM-DD` — drives sort order            |
| `status`      | no       | `live` \| `wip` \| `archived` — defaults `live` |
| `tags`        | no       | Free-form string tags                          |

\* Optional but recommended — without `title`/`date` the listing degrades
(slug used as title, item sorts last).

## Design conventions

- **UI library is ZUI** (`@mrmartineau/zui`). Astro components import from
  `@mrmartineau/zui/astro`; CSS comes from `@mrmartineau/zui/css` (imported once
  in `Layout.astro`). See the loaded `using-zui` skill for the full component
  and token reference.
- **Always use ZUI design tokens** — never hard-code colours, spacing, radii,
  shadows or font sizes. Tokens: `--color-*`, `--space-*`, `--step-*`,
  `--radius-*`, `--shadow-*`, `--ease*`, `--z-*`, `--border-style`.
- **Icons are Phosphor** — `<i class="ph ph-icon-name"></i>`. The web font is
  loaded in `Layout.astro`; never inline SVG.
- Each lab item page may have a **completely bespoke design**. `Layout.astro` is
  intentionally minimal so pages can opt in for the ZUI baseline or skip it.
- Component classes use the `zui-` prefix; utility classes have no prefix.

## Commands

```sh
npm run dev      # local dev server
npm run build    # static build to dist/  — run this to verify changes
npm run preview  # preview the build
```

Always run `npm run build` after changes to confirm the site compiles.

## Notes

- No Astro framework integration is installed. `.astro` ZUI components work
  out of the box. To use React/Solid/Svelte/Vue ZUI wrappers, install that
  framework's `@astrojs/*` integration first.
