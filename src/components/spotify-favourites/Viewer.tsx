import { useMemo, useState } from 'react'
import {
	Badge,
	Button,
	Code,
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
	Input,
	Link,
	Select,
} from '@mrmartineau/zui/react'

// ---------------------------------------------------------------------------
// Types — mirror the spotify-fave-artists CLI output (index.ts / albums.ts).
// ---------------------------------------------------------------------------
interface QualifyingAlbum {
	name: string
	distinctTracks: number
	totalTracks: number | null
	coverage: number | null
	msPlayed: number
	image?: string | null
}
interface ArtistResult {
	artist: string
	qualifyingAlbums: number
	score: number
	totalMsPlayed: number
	albums: QualifyingAlbum[]
	artistImage?: string | null
}
interface AlbumResult {
	artist: string
	album: string
	distinctTracks: number
	totalTracks: number | null
	coverage: number | null
	plays: number
	msPlayed: number
	score: number
	albumImage?: string | null
	artistImage?: string | null
}
interface RunMeta {
	generatedAt: string | null
	mode: string | null
	signal: string | null
	totals: { plays: number | null; artists: number | null; ranked: number }
}
type RunKind = 'artists' | 'albums'
interface Run {
	file: string
	kind: RunKind
	meta: RunMeta
	results: any[]
}

// ---------------------------------------------------------------------------
// Build-time data load. Drop favourite-artists*.json / favourite-albums*.json
// into ./runs and they appear here automatically — bundled at build, no server
// or API needed (the original viewer used serve.ts; here it's all static).
// ---------------------------------------------------------------------------
const modules = import.meta.glob('./runs/*.json', { eager: true }) as Record<
	string,
	any
>

function loadRuns(): Run[] {
	const runs = Object.entries(modules).map(([path, mod]): Run => {
		const file = path.split('/').pop()!
		const data = mod.default ?? mod
		const kind: RunKind = file.startsWith('favourite-albums')
			? 'albums'
			: 'artists'

		// Legacy bare-array output: synthesise a minimal meta.
		if (Array.isArray(data)) {
			return {
				file,
				kind,
				meta: {
					generatedAt: null,
					mode: null,
					signal: null,
					totals: { plays: null, artists: null, ranked: data.length },
				},
				results: data,
			}
		}

		const results = data.results ?? []
		const t = data.meta?.totals ?? {}
		return {
			file,
			kind,
			meta: {
				generatedAt: data.meta?.generatedAt ?? null,
				mode: data.meta?.mode ?? null,
				signal: data.meta?.signal ?? null,
				totals: {
					plays: t.plays ?? null,
					artists: t.artists ?? null,
					ranked: t.rankedArtists ?? t.rankedAlbums ?? results.length,
				},
			},
			results,
		}
	})
	// newest first; files without a timestamp sink to the bottom
	return runs.sort((a, b) =>
		(b.meta.generatedAt ?? '').localeCompare(a.meta.generatedAt ?? ''),
	)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const fmtHours = (ms?: number | null) =>
	ms == null ? '' : `${(ms / 3_600_000).toFixed(1)}h`
const fmtNum = (n?: number | null) => (n == null ? '—' : n.toLocaleString())
// Stable (locale-independent) date so SSR and client markup match on hydration.
const fmtDate = (iso: string | null) =>
	iso ? iso.slice(0, 16).replace('T', ' ') : ''
const initial = (s: string) => (s.trim()[0] || '?').toUpperCase()

// Stable hue per label, so a missing image always gets the same colour.
function hue(s: string) {
	let h = 0
	for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
	return h % 360
}

// Coloured-initial tile with the real image layered on top (the original
// viewer's signature placeholder; ZUI's Avatar fallback is a neutral icon).
function Cover({
	src,
	label,
	variant,
}: {
	src?: string | null
	label: string
	variant: 'art' | 'thumb' | 'avatar'
}) {
	return (
		<span
			className={`sf-cover sf-cover-${variant}`}
			style={{ '--h': hue(label) } as React.CSSProperties}
		>
			<span className="sf-cover-initial">{initial(label)}</span>
			{src ? (
				<img
					loading="lazy"
					src={src}
					alt=""
					onError={(e) => e.currentTarget.remove()}
				/>
			) : null}
		</span>
	)
}

const clamp = (n: number) => Math.max(0, Math.min(1, n))
const Bar = ({ frac }: { frac: number }) => (
	<span className="sf-track">
		<span className="sf-fill" style={{ width: `${clamp(frac) * 100}%` }} />
	</span>
)

const PAGE = 50

// Albums default to "hours played"; artists default to score order.
const defaultSortFor = (kind: RunKind): 'default' | 'hours' =>
	kind === 'albums' ? 'hours' : 'default'

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------
function ArtistsView({
	items,
	all,
	enriched,
}: {
	items: ArtistResult[]
	all: ArtistResult[]
	enriched: boolean
}) {
	const maxScore = Math.max(1, ...all.map((r) => r.score))
	return (
		<div className="sf-list">
			{items.map((r, i) => {
				const rank = all.indexOf(r) + 1
				const maxTracks = Math.max(1, ...r.albums.map((a) => a.distinctTracks))
				return (
					<details key={`${r.artist}-${rank}`} className="sf-artist" open={i === 0}>
						<summary className="sf-artist-summary">
							<span className="sf-rank">{rank}</span>
							<Cover src={r.artistImage} label={r.artist} variant="avatar" />
							<span className="sf-artist-name">
								{r.artist}
								<span className="sf-artist-sub">
									{r.qualifyingAlbums} album{r.qualifyingAlbums === 1 ? '' : 's'} ·{' '}
									{fmtHours(r.totalMsPlayed)} total
								</span>
							</span>
							<span className="sf-score">
								<span className="sf-score-num">{fmtNum(r.score)}</span>
								<span className="sf-score-lbl">score</span>
							</span>
						</summary>
						<div className="sf-scorebar">
							<Bar frac={r.score / maxScore} />
						</div>
						<ul className="sf-albums">
							{r.albums.map((a) => {
								const frac = enriched ? a.coverage ?? 0 : a.distinctTracks / maxTracks
								const detail = enriched
									? `${a.distinctTracks}/${a.totalTracks} · ${Math.round((a.coverage ?? 0) * 100)}%`
									: `${a.distinctTracks} tracks`
								return (
									<li key={a.name} className="sf-album-row">
										<Cover src={a.image} label={a.name} variant="thumb" />
										<span className="sf-album-name">{a.name}</span>
										<span className="sf-album-detail">{detail}</span>
										<span className="sf-album-bar">
											<Bar frac={frac} />
										</span>
									</li>
								)
							})}
						</ul>
					</details>
				)
			})}
		</div>
	)
}

function AlbumsView({
	items,
	all,
	enriched,
}: {
	items: AlbumResult[]
	all: AlbumResult[]
	enriched: boolean
}) {
	const maxTracks = Math.max(1, ...all.map((r) => r.distinctTracks))
	return (
		<div className="sf-grid">
			{items.map((a) => {
				const rank = all.indexOf(a) + 1
				const frac = enriched ? a.coverage ?? 0 : a.distinctTracks / maxTracks
				const detail = enriched
					? `${a.distinctTracks}/${a.totalTracks} · ${Math.round((a.coverage ?? 0) * 100)}%`
					: `${a.distinctTracks} tracks`
				return (
					<article key={`${a.album}-${a.artist}-${rank}`} className="sf-card">
						<div className="sf-card-art">
							<Cover src={a.albumImage} label={a.album} variant="art" />
							<span className="sf-card-rank">
								<Badge variant="fill">#{rank}</Badge>
							</span>
						</div>
						<div className="sf-card-body">
							<div className="sf-card-title" title={a.album}>
								{a.album}
							</div>
							<div className="sf-card-artist">
								<Cover src={a.artistImage} label={a.artist} variant="avatar" />
								<span>{a.artist}</span>
							</div>
							<div className="sf-card-barwrap">
								<Bar frac={frac} />
							</div>
							<div className="sf-card-meta">
								<span>{detail}</span>
								<span>{fmtHours(a.msPlayed)}</span>
							</div>
						</div>
					</article>
				)
			})}
		</div>
	)
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------
export default function Viewer() {
	const runs = useMemo(loadRuns, [])
	const [file, setFile] = useState(runs[0]?.file ?? '')
	const [sortBy, setSortBy] = useState<'default' | 'hours'>(() =>
		defaultSortFor(runs[0]?.kind ?? 'artists'),
	)
	const [query, setQuery] = useState('')
	const [shown, setShown] = useState(PAGE)

	const run = runs.find((r) => r.file === file) ?? runs[0]

	if (!run) {
		return (
			<div className="sf">
				<div className="sf-empty">
					<p>No run files found.</p>
					<p>
						Drop <code>favourite-artists*.json</code> or{' '}
						<code>favourite-albums*.json</code> into{' '}
						<code>src/components/spotify-favourites/runs/</code> and rebuild.
					</p>
				</div>
			</div>
		)
	}

	const enriched =
		run.meta.signal === 'coverage' ||
		run.results.some(
			(r: any) => r.coverage != null || r.albums?.some((a: any) => a.coverage != null),
		)
	const hoursOf = (r: any) =>
		(run.kind === 'albums' ? r.msPlayed : r.totalMsPlayed) ?? 0
	const ordered =
		sortBy === 'hours'
			? [...run.results].sort((a, b) => hoursOf(b) - hoursOf(a))
			: run.results

	const q = query.trim().toLowerCase()
	const filtered = q
		? ordered.filter((r: any) =>
				run.kind === 'albums'
					? r.album.toLowerCase().includes(q) || r.artist.toLowerCase().includes(q)
					: r.artist.toLowerCase().includes(q),
			)
		: ordered
	const slice = filtered.slice(0, shown)
	const reset = () => setShown(PAGE)

	return (
		<div className="sf">
			<header className="sf-header">
				<div className="sf-header-row">
					<h1 className="sf-title">
						<i className="ph ph-spotify-logo" /> Spotify Favourites
						<a
							className="sf-repo"
							href="https://github.com/mrmartineau/spotify-fave-artists"
							target="_blank"
							rel="noreferrer"
							aria-label="View source on GitHub"
						>
							<i className="ph ph-github-logo" />
						</a>
					</h1>
					<div className="sf-controls">
						<Select
							aria-label="Run"
							value={file}
							onChange={(e) => {
								const next = e.currentTarget.value
								setFile(next)
								setSortBy(defaultSortFor(runs.find((r) => r.file === next)?.kind ?? 'artists'))
								reset()
							}}
						>
							{runs.map((r) => (
								<option key={r.file} value={r.file}>
									{`${r.kind === 'albums' ? 'Albums' : 'Artists'} · ${
										r.meta.generatedAt ? fmtDate(r.meta.generatedAt) : r.file
									}${r.meta.mode ? ` · ${r.meta.mode}` : ''}`}
								</option>
							))}
						</Select>
						<Select
							aria-label="Sort"
							value={sortBy}
							onChange={(e) => {
								setSortBy(e.currentTarget.value as 'default' | 'hours')
								reset()
							}}
						>
							<option value="default">
								{run.kind === 'albums' ? 'Sort: engagement' : 'Sort: score'}
							</option>
							<option value="hours">Sort: hours played</option>
						</Select>
						<Input
							type="search"
							aria-label="Filter"
							placeholder={run.kind === 'albums' ? 'Filter albums…' : 'Filter artists…'}
							value={query}
							onChange={(e) => {
								setQuery(e.currentTarget.value)
								reset()
							}}
						/>
					</div>
				</div>
				<div className="sf-chips">
					<Badge variant="subtle">
						view <b>{run.kind}</b>
					</Badge>
					{run.meta.mode && (
						<Badge variant="subtle">
							mode <b>{run.meta.mode}</b>
						</Badge>
					)}
					{run.meta.signal && (
						<Badge variant="subtle">
							ranked by <b>{run.meta.signal}</b>
						</Badge>
					)}
					{run.meta.totals.plays != null && (
						<Badge variant="subtle">
							<b>{fmtNum(run.meta.totals.plays)}</b> plays
						</Badge>
					)}
					{run.meta.totals.artists != null && (
						<Badge variant="subtle">
							<b>{fmtNum(run.meta.totals.artists)}</b> artists
						</Badge>
					)}
					<Badge variant="subtle">
						<b>{fmtNum(run.meta.totals.ranked)}</b>{' '}
						{run.kind === 'albums' ? 'albums' : 'ranked'}
					</Badge>
				</div>
			</header>

			<main className="sf-main">
				<Collapsible className="sf-info">
					<CollapsibleTrigger className="sf-info-trigger">
						<i className="ph ph-info" /> What is this? Run it on your own
						listening history
					</CollapsibleTrigger>
					<CollapsibleContent className="sf-info-content">
						<p>
							This ranks your most-explored Spotify artists and albums by{' '}
							<b>album engagement</b> — how broadly and deeply you worked through
							each artist's catalogue (distinct tracks per album) — rather than
							raw play counts. One song on repeat counts for nothing; steadily
							making your way through whole albums counts for everything.
						</p>
						<p>
							It's a small open-source tool you can run on your own data. It works
							entirely offline from a Spotify export — no account or API needed:
						</p>
						<ol>
							<li>
								Request your <b>Extended streaming history</b> from your{' '}
								<Link
									href="https://www.spotify.com/account/privacy/"
									target="_blank"
									rel="noreferrer"
								>
									Spotify privacy settings
								</Link>{' '}
								(can take a few days to arrive).
							</li>
							<li>
								Unzip it and run <Code>bun run index.ts --dir ./data</Code>{' '}
								against the <Code>Streaming_History_Audio_*.json</Code> files.
							</li>
							<li>
								Browse the ranked results — optionally add <Code>--enrich</Code>{' '}
								for cover art and artist photos.
							</li>
						</ol>
						<p>
							Full instructions, the scoring method and the source code are in the
							repo:{' '}
							<Link
								href="https://github.com/mrmartineau/spotify-fave-artists"
								target="_blank"
								rel="noreferrer"
							>
								<i className="ph ph-github-logo" /> mrmartineau/spotify-fave-artists
							</Link>
						</p>
					</CollapsibleContent>
				</Collapsible>

				{slice.length === 0 ? (
					<p className="sf-empty">Nothing matches “{query}”.</p>
				) : run.kind === 'albums' ? (
					<AlbumsView
						items={slice as AlbumResult[]}
						all={filtered as AlbumResult[]}
						enriched={enriched}
					/>
				) : (
					<ArtistsView
						items={slice as ArtistResult[]}
						all={filtered as ArtistResult[]}
						enriched={enriched}
					/>
				)}

				{filtered.length > shown && (
					<Button
						variant="outline"
						className="sf-more"
						onClick={() => setShown((s) => s + PAGE)}
					>
						Show more ({filtered.length - shown} hidden)
					</Button>
				)}
			</main>
		</div>
	)
}
