# lab.zander.wtf

A personal lab site hosting **experiments, little tools and demos**. Built with
[Astro](https://astro.build) (static output) and styled with
[ZUI](https://github.com/mrmartineau/zui).

The homepage lists every lab item; each item is its own page with a bespoke
design.

## Lab items

| Slug                  | What it is                                              |
| :-------------------- | :------------------------------------------------------ |
| `data-transformation` | A React "dojo" for practising data-transform challenges |
| `drawing-app`         | A small in-browser drawing app                          |
| `keyboard-only`       | A cursorless page navigated entirely with the keyboard  |
| `spotify-favourites`  | Browse most-explored Spotify artists & albums (ZUI)     |
| `zui-components`      | A reference page showcasing ZUI components              |

## Project structure

```text
src/
  components/            Per-item React/Astro components
  data/lab.ts            Lab item types + discovery helper (no manual registry)
  layouts/Layout.astro   Minimal shell — ZUI CSS + Phosphor icons + body reset
  pages/
    index.astro          Homepage — globs pages and reads their frontmatter
    <slug>/index.astro   One directory per lab item, named by its slug
```

## Adding a lab item

1. Create `src/pages/<slug>/index.astro` (or `index.md`), plus any supporting
   files — components, assets, etc.
2. Declare the item's metadata in that page's frontmatter.

No central registry to edit — the homepage globs `src/pages/<slug>/index.{astro,md}`,
derives the slug from the directory name, and reads each page's frontmatter.
URL is `/<slug>`. List is sorted newest-first by `date`.

### Frontmatter metadata

In an `.astro` page, expose metadata as module-level `export const`:

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

In an `.md` page, put the same keys in the YAML frontmatter block.

| Field         | Required | Notes                                           |
| :------------ | :------- | :---------------------------------------------- |
| `title`       | no\*     | Display name — falls back to the slug           |
| `description` | no       | One-line summary                                |
| `date`        | no\*     | ISO `YYYY-MM-DD` — drives sort order            |
| `status`      | no       | `live` \| `wip` \| `archived` — defaults `live` |
| `tags`        | no       | Free-form string tags                           |

\* Optional but recommended — without `title`/`date` the listing degrades.

## Design conventions

- **UI library is ZUI** (`@mrmartineau/zui`). CSS is imported once in
  `Layout.astro`. Always use ZUI design tokens — never hard-code colours,
  spacing, radii, shadows or font sizes.
- **Icons are Phosphor** — `<i class="ph ph-icon-name"></i>`. The web font is
  loaded in `Layout.astro`.
- Each lab item page may have a completely bespoke design. `Layout.astro` is
  intentionally minimal.

## Commands

Requires Node `>=22.12.0`. Run from the project root:

| Command        | Action                               |
| :------------- | :----------------------------------- |
| `pnpm install` | Install dependencies                 |
| `pnpm dev`     | Start the local dev server           |
| `pnpm build`   | Build the static site to `./dist/`   |
| `pnpm preview` | Preview the production build locally |

Run `pnpm build` after changes to confirm the site compiles.

See [AGENTS.md](./AGENTS.md) for full guidance on working in this repo.
