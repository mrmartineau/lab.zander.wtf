/** @jsxImportSource solid-js */
import { batch, createEffect, createSignal, For, Index, on, onCleanup, onMount, Show, type JSX } from 'solid-js'
import { createStore, reconcile, unwrap } from 'solid-js/store'
import {
	ANIMS,
	clone,
	DEFAULT_STATE,
	decodeState,
	encodeState,
	exportCode,
	gradient,
	loadFont,
	merge,
	STAGES,
	type FillType,
	type WAState,
} from './engine'
import { FONTS, PRESETS, SWATCHES } from './presets'
import { fileNameFor, saveStage } from './png'
import WordArt, { type WordArtApi } from './WordArt'

const TABS = [
	{ id: 'gallery', label: 'Gallery', icon: 'ph-squares-four' },
	{ id: 'font', label: 'Font', icon: 'ph-text-aa' },
	{ id: 'colour', label: 'Colour', icon: 'ph-palette' },
	{ id: 'depth', label: '3D', icon: 'ph-cube' },
	{ id: 'shape', label: 'Shape', icon: 'ph-bezier-curve' },
	{ id: 'tilt', label: 'Tilt', icon: 'ph-perspective' },
	{ id: 'motion', label: 'Motion', icon: 'ph-sparkle' },
	{ id: 'code', label: 'CSS', icon: 'ph-code' },
] as const
type Tab = (typeof TABS)[number]['id']

const SHAPES: { name: string; icon: string; shape: Partial<WAState['shape']> }[] = [
	{ name: 'Flat', icon: 'ph-minus', shape: { curve: 0, wave: 0, bulge: 0, taper: 0 } },
	{ name: 'Arch', icon: 'ph-rainbow', shape: { curve: 90, wave: 0, bulge: 0, taper: 0 } },
	{ name: 'Smile', icon: 'ph-smiley', shape: { curve: -90, wave: 0, bulge: 0, taper: 0 } },
	{ name: 'Circle', icon: 'ph-circle-dashed', shape: { curve: 360, wave: 0, bulge: 0, taper: 0 } },
	{ name: 'Wave', icon: 'ph-wave-sine', shape: { curve: 0, wave: 35, freq: 1.5, bulge: 0, taper: 0 } },
	{ name: 'Inflate', icon: 'ph-balloon', shape: { curve: 0, wave: 0, bulge: 70, taper: 0 } },
	{ name: 'Pinch', icon: 'ph-hourglass', shape: { curve: 0, wave: 0, bulge: -50, taper: 0 } },
	{ name: 'Grow', icon: 'ph-trend-up', shape: { curve: 0, wave: 0, bulge: 0, taper: 50 } },
	{ name: 'Shrink', icon: 'ph-trend-down', shape: { curve: 0, wave: 0, bulge: 0, taper: -50 } },
	{ name: 'Rainbow', icon: 'ph-cloud-sun', shape: { curve: 140, wave: 0, bulge: 40, taper: 0 } },
]


const FILLS: { id: FillType; label: string; icon: string }[] = [
	{ id: 'solid', label: 'Solid', icon: 'ph-square' },
	{ id: 'linear', label: 'Linear', icon: 'ph-gradient' },
	{ id: 'radial', label: 'Radial', icon: 'ph-circle-half' },
	{ id: 'conic', label: 'Conic', icon: 'ph-chart-pie-slice' },
]

/* ───────────── random helpers ───────────── */

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]
const hex = (h: number, s: number, l: number) => {
	s /= 100
	l /= 100
	const f = (k0: number) => {
		const k = (k0 + h / 30) % 12
		const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))
		return Math.round(c * 255)
			.toString(16)
			.padStart(2, '0')
	}
	return `#${f(0)}${f(8)}${f(4)}`
}
const randomColour = () => hex(rand(0, 360), rand(70, 100), rand(45, 65))
function randomPalette() {
	const h = rand(0, 360)
	const step = pick([25, 40, 60, 120])
	return Array.from({ length: pick([2, 3, 3, 4, 5]) }, (_, i) => hex((h + i * step) % 360, rand(75, 100), rand(45, 70)))
}

function surpriseState(text: string): WAState {
	const pal = randomPalette()
	const dark = hex(rand(0, 360), rand(40, 80), rand(10, 25))
	const curve = pick([0, 0, rand(30, 140), -rand(30, 120), 360])
	return merge(clone(DEFAULT_STATE), {
		text,
		font: pick(FONTS.slice(0, -4)),
		size: 120,
		spacing: Math.round(rand(0, 8)),
		fill: {
			type: pick(['linear', 'linear', 'radial', 'conic']),
			angle: Math.round(rand(0, 360)),
			stops: pal,
			hard: Math.random() < 0.3,
		},
		stroke: { width: pick([0, 1, 2, 3, 5]), color: pick([dark, '#ffffff', '#000000']) },
		extrude: { depth: pick([0, 8, 14, 22, 30]), angle: Math.round(rand(20, 160)), color: dark },
		shadow:
			Math.random() < 0.5
				? { x: 0, y: 10, blur: 16, color: '#00000066' }
				: { x: 0, y: 0, blur: 20, color: `${pal[0]}aa` },
		shape: {
			curve: Math.round(curve),
			wave: curve === 0 && Math.random() < 0.5 ? Math.round(rand(15, 45)) : 0,
			freq: pick([1, 1.5, 2]),
			bulge: Math.random() < 0.3 ? Math.round(rand(-40, 80)) : 0,
			taper: Math.random() < 0.2 ? Math.round(rand(-40, 40)) : 0,
		},
		tf: {
			rotate: Math.random() < 0.3 ? Math.round(rand(-12, 12)) : 0,
			skew: Math.random() < 0.2 ? Math.round(rand(-15, 15)) : 0,
			tiltX: Math.random() < 0.2 ? Math.round(rand(20, 50)) : 0,
			tiltY: 0,
			stretch: 1,
		},
		anim: Math.random() < 0.5 ? 'none' : pick(['wave', 'jelly', 'swing', 'float', 'rainbow', 'flow']),
	})
}

/* ───────────── store path helpers ───────────── */

const getPath = (obj: unknown, path: string): any => path.split('.').reduce<any>((o, k) => o?.[k], obj)

export default function Studio() {
	const [state, setState] = createStore<WAState>(clone(DEFAULT_STATE))
	const set = (path: string, v: unknown) => (setState as any)(...path.split('.'), v)

	const [tab, setTab] = createSignal<Tab>('gallery')
	const [fontTick, setFontTick] = createSignal(0)
	const [fontStatus, setFontStatus] = createSignal<{ state: 'loading' | 'ok' | 'error'; font: string } | null>(null)
	const [fontDraft, setFontDraft] = createSignal(state.font)
	const [toast, setToast] = createSignal('')
	const [chipFonts, setChipFonts] = createSignal(false)
	let wordart: WordArtApi | undefined

	/* ───────────── history + share hash ───────────── */

	const past: string[] = []
	const future: string[] = []
	const [canUndo, setCanUndo] = createSignal(false)
	const [canRedo, setCanRedo] = createSignal(false)
	let committed = ''
	let commitTimer = 0
	let hashTimer = 0

	const syncHistory = () => {
		setCanUndo(past.length > 0)
		setCanRedo(future.length > 0)
	}

	/** Record the current state as a history step, if it changed. */
	function commit() {
		clearTimeout(commitTimer)
		const now = JSON.stringify(state)
		if (now === committed) return
		if (committed) past.push(committed)
		if (past.length > 100) past.shift()
		future.length = 0
		committed = now
		syncHistory()
	}

	// Reading the whole store via JSON tracks every field
	createEffect(() => {
		JSON.stringify(state)
		clearTimeout(commitTimer)
		commitTimer = window.setTimeout(commit, 350)
		clearTimeout(hashTimer)
		hashTimer = window.setTimeout(() => history.replaceState(null, '', `#${encodeState(unwrap(state))}`), 300)
	})

	function travel(from: string[], to: string[]) {
		// Land any edit still inside the debounce window first, so undo steps
		// back from it rather than skipping over it.
		commit()
		const snap = from.pop()
		if (!snap) return
		to.push(committed)
		committed = snap
		setState(reconcile(JSON.parse(snap)))
		syncHistory()
	}
	const undo = () => travel(past, future)
	const redo = () => travel(future, past)

	/* ───────────── fonts ───────────── */

	createEffect(
		on(
			() => [state.font, state.weight] as const,
			async ([font, weight]) => {
				setFontDraft(font)
				setFontStatus({ state: 'loading', font })
				const ok = await loadFont(font, weight)
				if (state.font !== font) return
				setFontStatus({ state: ok ? 'ok' : 'error', font })
				setFontTick((t) => t + 1)
			},
		),
	)

	function useFont(name: string) {
		name = name.trim()
		if (!name) return
		// Match curated names case-insensitively so "lobster" works
		setState('font', FONTS.find((f) => f.toLowerCase() === name.toLowerCase()) ?? name)
	}

	// Each chip shows its name in its own face. Tiny `text=` subsets keep this
	// cheap; families are renamed so they never shadow the full font.
	async function loadChipFonts() {
		if (chipFonts()) return
		setChipFonts(true)
		const chars = [...new Set(FONTS.join(''))].join('')
		for (let i = 0; i < FONTS.length; i += 12) {
			const fam = FONTS.slice(i, i + 12)
				.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}`)
				.join('&')
			try {
				const res = await fetch(
					`https://fonts.googleapis.com/css2?${fam}&text=${encodeURIComponent(chars)}&display=swap`,
				)
				if (!res.ok) continue
				const style = document.createElement('style')
				style.textContent = (await res.text()).replace(/font-family: '([^']+)'/g, "font-family: '$1 WA Preview'")
				document.head.append(style)
			} catch {}
		}
	}
	createEffect(() => tab() === 'font' && loadChipFonts())

	/* ───────────── actions ───────────── */

	const pop = () => wordart?.pop()

	function applyPreset(i: number) {
		setState(reconcile({ ...clone(PRESETS[i].state), text: state.text, bg: state.bg }))
		pop()
	}
	function surprise() {
		setState(reconcile({ ...surpriseState(state.text), bg: state.bg }))
		pop()
	}

	let toastTimer = 0
	function notify(msg: string) {
		setToast(msg)
		clearTimeout(toastTimer)
		toastTimer = window.setTimeout(() => setToast(''), 1800)
	}
	async function copy(text: string, what: string) {
		try {
			await navigator.clipboard.writeText(text)
			notify(`${what} copied!`)
		} catch {
			notify(`Couldn't copy ${what} — select it and copy by hand`)
		}
	}
	const code = () => {
		if (!wordart) return { css: '', html: '' }
		return exportCode(unwrap(state), wordart.chars(), wordart.geo(), wordart.wEm())
	}
	function download() {
		const { css, html } = code()
		const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${state.text.replace(/</g, '&lt;')}</title>
<style>
${css}
body { margin: 0; min-height: 100vh; display: grid; place-items: center; overflow: hidden; background: radial-gradient(circle at 50% 30%, #2a1d6b, #0b0820); }
</style>
</head>
<body>
${html}
</body>
</html>
`
		const a = document.createElement('a')
		a.href = URL.createObjectURL(new Blob([doc], { type: 'text/html' }))
		a.download = `${fileName()}.html`
		a.click()
		setTimeout(() => URL.revokeObjectURL(a.href), 1000)
	}

	/* ───────────── PNG + full screen ───────────── */

	let stageEl!: HTMLDivElement
	const [full, setFull] = createSignal(false)
	const [saving, setSaving] = createSignal(false)
	const fileName = () => fileNameFor(state.text)

	async function savePicture() {
		if (!wordart || saving()) return
		setSaving(true)
		try {
			const kind = await saveStage(wordart, unwrap(state), stageEl)
			notify(kind === 'png' ? 'Picture saved!' : "Saved as SVG — this browser can't make PNGs")
		} catch {
			notify("Couldn't save the picture")
		} finally {
			setSaving(false)
		}
	}

	/** The read-only, full-window view of this piece — the link to share. */
	// Reads through the store proxy, so the "View it" href stays in sync
	const viewUrl = () => `${location.origin}/word-art/view#${encodeState(state)}`

	// Real full screen where the browser allows it (not iPhone Safari); else
	// the stage just covers the page.
	function toggleFull() {
		if (document.fullscreenElement) return void document.exitFullscreen()
		if (full()) return setFull(false)
		if (stageEl.requestFullscreen) stageEl.requestFullscreen().catch(() => setFull(true))
		else setFull(true)
	}
	createEffect(() => document.documentElement.classList.toggle('wa-locked', full() && !document.fullscreenElement))

	/* ───────────── mount ───────────── */

	onMount(() => {
		const fromHash = decodeState(location.hash.slice(1))
		if (fromHash) setState(reconcile(fromHash))
		const onFull = () => setFull(document.fullscreenElement === stageEl)
		document.addEventListener('fullscreenchange', onFull)
		const onFonts = () => setFontTick((t) => t + 1)
		document.fonts.addEventListener('loadingdone', onFonts)
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && full() && !document.fullscreenElement) return setFull(false)
			if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
			if ((e.target as HTMLElement).matches('input[type=text], input:not([type])')) return
			e.preventDefault()
			e.shiftKey ? redo() : undo()
		}
		addEventListener('keydown', onKey)
		onCleanup(() => {
			document.fonts.removeEventListener('loadingdone', onFonts)
			document.removeEventListener('fullscreenchange', onFull)
			document.documentElement.classList.remove('wa-locked')
			removeEventListener('keydown', onKey)
		})
	})

	/* ───────────── small controls ───────────── */

	const Range = (p: { label: string; path: string; min: number; max: number; step?: number; unit?: string }) => (
		<label class="wa-range">
			<span>
				{p.label}{' '}
				<output>
					{getPath(state, p.path)}
					{p.unit ?? ''}
				</output>
			</span>
			<input
				type="range"
				min={p.min}
				max={p.max}
				step={p.step ?? 1}
				value={getPath(state, p.path)}
				onInput={(e) => set(p.path, Number(e.currentTarget.value))}
			/>
		</label>
	)

	const Colour = (p: { path: string; label: string; alpha?: boolean }) => (
		<input
			type="color"
			aria-label={p.label}
			value={String(getPath(state, p.path)).slice(0, 7)}
			onInput={(e) => {
				const v = e.currentTarget.value
				if (!p.alpha) return set(p.path, v)
				// keep the alpha of the current colour
				const old = String(getPath(state, p.path))
				set(p.path, v + (old.length === 9 ? old.slice(7) : '88'))
			}}
		/>
	)

	const Pane = (p: { id: Tab; children: JSX.Element }) => (
		<Show when={tab() === p.id}>
			<div class="wa-pane" role="tabpanel" id={`panel-${p.id}`} aria-labelledby={`tab-${p.id}`}>
				{p.children}
			</div>
		</Show>
	)

	/* ───────────── 3D dial ───────────── */

	let dial!: HTMLDivElement
	const dialTo = (e: PointerEvent) => {
		const r = dial.getBoundingClientRect()
		const a = (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI
		setState('extrude', 'angle', Math.round((a + 360) % 360))
	}

	/* ───────────── view ───────────── */

	return (
		<div class="wa-workspace">
			<section class="wa-left" aria-label="Preview">
				<div ref={stageEl} class="wa-stage" classList={{ 'is-full': full() }} data-bg={state.bg}>
					<WordArt
						class="wa-stage-inner"
						state={state}
						fontTick={fontTick()}
						maxScale={full() ? 4 : 1}
						ref={(api) => (wordart = api)}
					/>
					<div class="wa-stage-tools">
						<Show when={full()}>
							<button type="button" class="wa-tool" title="Surprise me!" aria-label="Surprise me!" onClick={surprise}>
								<i class="ph ph-dice-five" />
							</button>
							<button
								type="button"
								class="wa-tool"
								title="Save as PNG"
								aria-label="Save as PNG"
								disabled={saving()}
								onClick={savePicture}
							>
								<i class={`ph ${saving() ? 'ph-spinner wa-spin' : 'ph-image'}`} />
							</button>
						</Show>
						<button
							type="button"
							class="wa-tool"
							title={full() ? 'Exit full screen' : 'Full screen'}
							aria-label={full() ? 'Exit full screen' : 'Full screen'}
							aria-pressed={full()}
							onClick={toggleFull}
						>
							<i class={`ph ${full() ? 'ph-corners-in' : 'ph-corners-out'}`} />
						</button>
					</div>
					{/* Inside the stage so it still shows in full screen */}
					<div class={`wa-toast${toast() ? ' is-on' : ''}`} role="status" aria-live="polite">
						{toast()}
					</div>
				</div>

				<div class="wa-textrow">
					<label class="wa-sr" for="wa-text">
						Your words
					</label>
					<input
						id="wa-text"
						class="zui-input wa-text"
						type="text"
						maxlength="48"
						autocomplete="off"
						placeholder="Type something…"
						value={state.text}
						onInput={(e) => setState('text', e.currentTarget.value)}
					/>
					<button class="zui-button zui-button-size-lg wa-dice" type="button" onClick={surprise}>
						<i class="ph ph-dice-five" /> Surprise me!
					</button>
				</div>

				<div class="wa-toolbar">
					<div class="wa-bgs" role="radiogroup" aria-label="Background">
						<For each={STAGES}>
							{(b) => (
								<button
									type="button"
									class="wa-bg"
									data-stage={b.id}
									role="radio"
									aria-checked={state.bg === b.id}
									title={b.label}
									aria-label={b.label}
									onClick={() => setState('bg', b.id)}
								/>
							)}
						</For>
					</div>
					<div class="wa-actions">
						<button class="zui-button zui-button-variant-ghost zui-button-size-sm" type="button" disabled={!canUndo()} onClick={undo}>
							<i class="ph ph-arrow-u-up-left" /> Undo
						</button>
						<button class="zui-button zui-button-variant-ghost zui-button-size-sm" type="button" disabled={!canRedo()} onClick={redo}>
							<i class="ph ph-arrow-u-up-right" /> Redo
						</button>
						<button
							class="zui-button zui-button-variant-outline zui-button-size-sm"
							type="button"
							disabled={saving()}
							onClick={savePicture}
						>
							<i class={`ph ${saving() ? 'ph-spinner wa-spin' : 'ph-image'}`} /> Save PNG
						</button>
						<button
							class="zui-button zui-button-variant-outline zui-button-size-sm"
							type="button"
							onClick={() => copy(viewUrl(), 'Share link')}
						>
							<i class="ph ph-link" /> Copy link
						</button>
						<a class="zui-button zui-button-size-sm" href={viewUrl()} target="_blank" rel="noopener">
							<i class="ph ph-frame-corners" /> View it
						</a>
					</div>
				</div>
			</section>

			<section class="wa-panel" aria-label="Controls">
				<div class="wa-tabs" role="tablist">
					<For each={TABS}>
						{(t, i) => (
							<button
								type="button"
								role="tab"
								class="wa-tab"
								id={`tab-${t.id}`}
								aria-controls={`panel-${t.id}`}
								aria-selected={tab() === t.id}
								tabindex={tab() === t.id ? 0 : -1}
								onClick={() => setTab(t.id)}
								onKeyDown={(e) => {
									const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
									if (!d) return
									e.preventDefault()
									const next = TABS[(i() + d + TABS.length) % TABS.length].id
									setTab(next)
									document.getElementById(`tab-${next}`)?.focus()
								}}
							>
								<i class={`ph ${t.icon}`} />
								<span>{t.label}</span>
							</button>
						)}
					</For>
				</div>

				<Pane id="gallery">
					<p class="wa-hint">Pick a style to start from. Your words stay the same.</p>
					<div class="wa-gallery">
						<For each={PRESETS}>
							{(pr, i) => {
								loadFont(pr.state.font, pr.state.weight).then(() => setFontTick((t) => t + 1))
								// Only the text is live, so tiles don't churn while you edit
								const [tile, setTile] = createStore(clone(pr.state))
								createEffect(() => setTile('text', state.text || 'WordArt'))
								return (
									<button type="button" class="wa-tile" onClick={() => applyPreset(i())}>
										<WordArt class="wa-tile-stage" state={tile} fontTick={fontTick()} maxScale={4} />
										<span>{pr.name}</span>
									</button>
								)
							}}
						</For>
					</div>
				</Pane>

				<Pane id="font">
					<div class="wa-field">
						<label class="zui-label" for="wa-font">
							Any Google Font
						</label>
						<div class="wa-fontrow">
							<input
								id="wa-font"
								class="zui-input"
								list="wa-fontlist"
								autocomplete="off"
								spellcheck={false}
								placeholder="e.g. Lobster, Nabla, Bungee Shade…"
								value={fontDraft()}
								onInput={(e) => {
									setFontDraft(e.currentTarget.value)
									// Picking from the datalist applies straight away
									if (FONTS.includes(e.currentTarget.value)) useFont(e.currentTarget.value)
								}}
								onKeyDown={(e) => e.key === 'Enter' && useFont(fontDraft())}
							/>
							<button class="zui-button" type="button" onClick={() => useFont(fontDraft())}>
								Use
							</button>
							<button
								class="zui-button zui-button-variant-subtle zui-button-icon"
								type="button"
								title="Random font"
								aria-label="Random font"
								onClick={() => useFont(pick(FONTS))}
							>
								<i class="ph ph-shuffle" />
							</button>
						</div>
						<datalist id="wa-fontlist">
							<For each={FONTS}>{(f) => <option value={f} />}</For>
						</datalist>
						<p class="wa-fontstatus" data-state={fontStatus()?.state} aria-live="polite">
							<Show when={fontStatus()}>
								{(s) =>
									s().state === 'loading' ? (
										<>Loading “{s().font}”…</>
									) : s().state === 'ok' ? (
										<>
											<i class="ph ph-check-circle" /> Using “{s().font}”
										</>
									) : (
										<>
											<i class="ph ph-warning-circle" /> Couldn't find “{s().font}” on Google Fonts
										</>
									)
								}
							</Show>
						</p>
						<p class="wa-hint">
							Type any family from{' '}
							<a href="https://fonts.google.com" target="_blank" rel="noopener">
								fonts.google.com
							</a>
							, or tap one below.
						</p>
					</div>
					<div class="wa-fonts">
						<For each={FONTS}>
							{(f) => (
								<button
									type="button"
									class="wa-chip"
									aria-pressed={state.font === f}
									style={chipFonts() ? { 'font-family': `"${f} WA Preview", var(--font-body)` } : undefined}
									onClick={() => useFont(f)}
								>
									{f}
								</button>
							)}
						</For>
					</div>
					<div class="wa-sliders">
						<Range label="Size" path="size" min={40} max={220} unit="px" />
						<Range label="Weight" path="weight" min={100} max={900} step={100} />
						<Range label="Spacing" path="spacing" min={-10} max={60} />
					</div>
				</Pane>

				<Pane id="colour">
					<div class="wa-field">
						<span class="zui-label">Fill</span>
						<div class="wa-seg" role="radiogroup" aria-label="Fill type">
							<For each={FILLS}>
								{(f) => (
									<label>
										<input
											type="radio"
											name="filltype"
											value={f.id}
											checked={state.fill.type === f.id}
											onChange={() => setState('fill', 'type', f.id)}
										/>
										<span>
											<i class={`ph ${f.icon}`} /> {f.label}
										</span>
									</label>
								)}
							</For>
						</div>
					</div>
					<div
						class="wa-gradbar"
						aria-hidden="true"
						style={{
							background: gradient({
								...state.fill,
								stops: [...state.fill.stops],
								type: state.fill.type === 'solid' ? 'solid' : 'linear',
								angle: 90,
							}),
						}}
					/>
					<div class="wa-field">
						<span class="zui-label">Colours</span>
						<div class="wa-stops">
							<Index each={state.fill.stops}>
								{(c, i) => (
									<div class="wa-stop">
										<input
											type="color"
											value={c()}
											aria-label={`Colour ${i + 1}`}
											onInput={(e) => setState('fill', 'stops', i, e.currentTarget.value)}
										/>
										<Show when={state.fill.stops.length > 1}>
											<button
												type="button"
												class="wa-stop-x"
												aria-label={`Remove colour ${i + 1}`}
												onClick={() => setState('fill', 'stops', (s) => s.filter((_, j) => j !== i))}
											>
												<i class="ph ph-x" />
											</button>
										</Show>
									</div>
								)}
							</Index>
							<div class="wa-swatches">
								<For each={SWATCHES}>
									{(sw) => (
										<button
											type="button"
											class="wa-swatch"
											style={{ '--sw': sw }}
											aria-label={`Add ${sw}`}
											onClick={() => {
												if (state.fill.type === 'solid') setState('fill', 'stops', [sw])
												else if (state.fill.stops.length < 8) setState('fill', 'stops', (s) => [...s, sw])
											}}
										/>
									)}
								</For>
							</div>
						</div>
						<div class="wa-stopactions">
							<button
								class="zui-button zui-button-variant-subtle zui-button-size-sm"
								type="button"
								disabled={state.fill.stops.length >= 8}
								onClick={() =>
									batch(() => {
										setState('fill', 'stops', (s) => [...s, randomColour()])
										if (state.fill.type === 'solid') setState('fill', 'type', 'linear')
									})
								}
							>
								<i class="ph ph-plus" /> Add
							</button>
							<button
								class="zui-button zui-button-variant-subtle zui-button-size-sm"
								type="button"
								onClick={() => setState('fill', 'stops', (s) => [...s].reverse())}
							>
								<i class="ph ph-arrows-left-right" /> Flip
							</button>
							<button
								class="zui-button zui-button-variant-subtle zui-button-size-sm"
								type="button"
								onClick={() => setState('fill', 'stops', randomPalette())}
							>
								<i class="ph ph-shuffle" /> Random
							</button>
						</div>
					</div>
					<div class="wa-sliders">
						<Range label="Gradient angle" path="fill.angle" min={0} max={360} unit="°" />
						<label class="zui-checkbox">
							<input
								type="checkbox"
								checked={state.fill.hard}
								onChange={(e) => setState('fill', 'hard', e.currentTarget.checked)}
							/>{' '}
							Stripes (hard edges)
						</label>
					</div>
					<div class="wa-field">
						<span class="zui-label">Outline</span>
						<div class="wa-colorrow">
							<Colour path="stroke.color" label="Outline colour" />
							<Range label="Thickness" path="stroke.width" min={0} max={12} step={0.5} unit="px" />
						</div>
					</div>
					<div class="wa-field">
						<span class="zui-label">Shadow &amp; glow</span>
						<div class="wa-colorrow">
							<Colour path="shadow.color" label="Shadow colour" alpha />
							<Range label="Blur" path="shadow.blur" min={0} max={60} unit="px" />
						</div>
						<div class="wa-sliders wa-two">
							<Range label="Across" path="shadow.x" min={-40} max={40} unit="px" />
							<Range label="Down" path="shadow.y" min={-40} max={40} unit="px" />
						</div>
					</div>
				</Pane>

				<Pane id="depth">
					<p class="wa-hint">Pull the letters out of the screen with a chunky 3D side.</p>
					<div class="wa-colorrow">
						<Colour path="extrude.color" label="3D colour" />
						<Range label="Depth" path="extrude.depth" min={0} max={48} unit="px" />
					</div>
					<div class="wa-dialrow">
						<div
							ref={dial}
							class="wa-dial"
							role="slider"
							tabindex="0"
							aria-label="3D direction"
							aria-valuemin={0}
							aria-valuemax={359}
							aria-valuenow={state.extrude.angle}
							style={{ '--a': `${state.extrude.angle}deg` }}
							onPointerDown={(e) => {
								dial.setPointerCapture(e.pointerId)
								dialTo(e)
							}}
							onPointerMove={(e) => dial.hasPointerCapture(e.pointerId) && dialTo(e)}
							onKeyDown={(e) => {
								const d = ({ ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5 } as Record<string, number>)[e.key]
								if (!d) return
								e.preventDefault()
								setState('extrude', 'angle', (a) => (a + d + 360) % 360)
							}}
						>
							<div class="wa-dial-hand" />
						</div>
						<Range label="Direction" path="extrude.angle" min={0} max={359} unit="°" />
					</div>
				</Pane>

				<Pane id="shape">
					<p class="wa-hint">Choose the line your words ride along.</p>
					<div class="wa-shapes">
						<For each={SHAPES}>
							{(s) => (
								<button type="button" class="wa-shape" onClick={() => setState('shape', s.shape)}>
									<i class={`ph ${s.icon}`} />
									<span>{s.name}</span>
								</button>
							)}
						</For>
					</div>
					<div class="wa-sliders">
						<Range label="Bend" path="shape.curve" min={-360} max={360} unit="°" />
						<Range label="Wave height" path="shape.wave" min={0} max={100} />
						<Range label="Wiggles" path="shape.freq" min={0.5} max={4} step={0.25} />
						<Range label="Puff up" path="shape.bulge" min={-80} max={150} />
						<Range label="Small → big" path="shape.taper" min={-80} max={80} />
					</div>
				</Pane>

				<Pane id="tilt">
					<div class="wa-sliders">
						<Range label="Rotate" path="tf.rotate" min={-180} max={180} unit="°" />
						<Range label="Lean" path="tf.skew" min={-45} max={45} unit="°" />
						<Range label="Lie back" path="tf.tiltX" min={-70} max={70} unit="°" />
						<Range label="Turn" path="tf.tiltY" min={-70} max={70} unit="°" />
						<Range label="Stretch" path="tf.stretch" min={0.4} max={2.5} step={0.05} unit="×" />
					</div>
					<button
						class="zui-button zui-button-variant-subtle zui-button-size-sm"
						type="button"
						onClick={() => setState('tf', { rotate: 0, skew: 0, tiltX: 0, tiltY: 0, stretch: 1 })}
					>
						<i class="ph ph-arrow-counter-clockwise" /> Straighten up
					</button>
				</Pane>

				<Pane id="motion">
					<p class="wa-hint">Make it move! It's all pure CSS animation, so it comes along when you copy the code.</p>
					<div class="wa-shapes">
						<For each={ANIMS}>
							{(a) => (
								<label class="wa-shape">
									<input
										type="radio"
										name="anim"
										value={a.id}
										checked={state.anim === a.id}
										onChange={() => setState('anim', a.id)}
									/>
									<i class={`ph ${a.icon}`} />
									<span>{a.label}</span>
								</label>
							)}
						</For>
					</div>
				</Pane>

				<Pane id="code">
					<p class="wa-hint">
						Plain HTML + CSS — no JavaScript needed. Sizes are in <code class="zui-code">em</code>, so change{' '}
						<code class="zui-code">font-size</code> and everything scales. All the settings live as custom properties
						at the top, ready to tweak.
					</p>
					<div class="wa-codeblock">
						<div class="wa-codehead">
							<span>CSS</span>
							<button class="zui-button zui-button-size-sm" type="button" onClick={() => copy(code().css, 'CSS')}>
								<i class="ph ph-copy" /> Copy CSS
							</button>
						</div>
						<pre class="zui-pre">
							<code>{code().css}</code>
						</pre>
					</div>
					<div class="wa-codeblock">
						<div class="wa-codehead">
							<span>HTML</span>
							<button class="zui-button zui-button-size-sm" type="button" onClick={() => copy(code().html, 'HTML')}>
								<i class="ph ph-copy" /> Copy HTML
							</button>
						</div>
						<pre class="zui-pre">
							<code>{code().html}</code>
						</pre>
					</div>
					<button class="zui-button zui-button-variant-outline" type="button" onClick={download}>
						<i class="ph ph-download-simple" /> Download as .html
					</button>
				</Pane>
			</section>

		</div>
	)
}
