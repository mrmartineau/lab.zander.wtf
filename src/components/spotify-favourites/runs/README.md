# Run data

Drop `favourite-artists*.json` and `favourite-albums*.json` files here — the
output of the [spotify-fave-artists](https://github.com/mrmartineau/spotify-fave-artists)
CLI (`index.ts` / `albums.ts`).

`Viewer.tsx` picks them up automatically via `import.meta.glob('./runs/*.json')`
at build time — no server or API. Add or replace files, then rebuild
(`npm run build`). Newest run (by `meta.generatedAt`) is selected first.

- **`kind`** (artists vs albums) is derived from the file name prefix.
- **Cover art and artist photos** only appear for **enriched** runs (the CLI's
  `--enrich` mode); offline runs fall back to coloured initials.
- The JSON is bundled into the page, so keep these to a sensible size/count for
  a demo (e.g. a `--top 50` run rather than the full library dump).

The two files currently here are small **sample** enriched runs — replace them
with your own.
