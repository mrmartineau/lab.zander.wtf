/**
 * Lab item discovery.
 *
 * There is no manual registry. The homepage globs `src/pages/<slug>/index.*`
 * and reads each page's frontmatter. The slug is the directory name.
 *
 * In a `.astro` page, expose metadata with module-level `export const`:
 *
 *   export const title = 'My experiment'
 *   export const description = 'What it does.'
 *   export const date = '2026-05-19'
 *   export const status = 'live'
 *   export const tags = ['demo']
 *
 * In a `.md` page, the same keys go in the YAML frontmatter block.
 */

export type LabStatus = 'live' | 'wip' | 'archived'

/** Metadata a lab item page exposes (via exports or markdown frontmatter). */
export interface LabFrontmatter {
	title?: string
	description?: string
	/** ISO date (YYYY-MM-DD). */
	date?: string
	status?: LabStatus
	tags?: string[]
}

/** A resolved lab item ready for the listing. */
export interface LabItem {
	slug: string
	title: string
	description?: string
	date: string
	status: LabStatus
	tags?: string[]
}

/** Map status → ZUI badge colour. */
export const statusColor: Record<LabStatus, string> = {
	live: 'emerald',
	wip: 'amber',
	archived: 'gray',
}

/** Internal page link for a lab item. */
export function labHref(item: LabItem): string {
	return `/${item.slug}`
}

/**
 * Turn an eager `import.meta.glob` of every `<slug>/index.{astro,md}` page
 * into a sorted (newest-first) list of lab items.
 *
 * `.astro` modules expose frontmatter as named exports; `.md` modules expose
 * them under a `frontmatter` object — both shapes are handled.
 */
export function buildLabItems(
	modules: Record<string, unknown>,
): LabItem[] {
	return Object.entries(modules)
		.map(([path, mod]): LabItem => {
			// path looks like `./<slug>/index.astro`
			const slug = path.split('/').at(-2) ?? path
			const record = mod as Record<string, unknown> & {
				frontmatter?: LabFrontmatter
			}
			const fm: LabFrontmatter = record.frontmatter ?? record
			return {
				slug,
				title: fm.title ?? slug,
				description: fm.description,
				date: fm.date ?? '',
				status: fm.status ?? 'live',
				tags: fm.tags,
			}
		})
		.sort((a, b) => b.date.localeCompare(a.date))
}
