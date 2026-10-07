/** @jsxImportSource solid-js */
import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { Pane, type BindingApi, type FolderApi } from 'tweakpane'
import {
	DEFAULTS,
	LIT,
	MODES,
	PARTS,
	PRESETS,
	SPEC,
	decode,
	dims,
	encode,
	randomise,
	sanitise,
	type Key,
	type Mode,
	type Params,
} from './engine'
import { Renderer } from './gl'

type Fav = { id: string; name: string; params: Params; thumb: string }
// Old name kept so favourites saved before the rename still load
const FAV_KEY = 'grain-studio-favourites'
const SIZES = [2048, 4096, 8192]
const TITLES: Record<string, string> = {
	...Object.fromEntries(MODES.map((m) => [m.id, m.label])),
	light: 'Light',
	colour: 'Colour',
	finish: 'Finish',
	motion: 'Motion',
	canvas: 'Canvas',
}

export default function Studio() {
	const params: Params = decode(location.hash.slice(1)) ?? { ...DEFAULTS }
	const [mode, setMode] = createSignal<Mode>(params.mode)
	const [favs, setFavs] = createSignal<Fav[]>([])
	const [thumbs, setThumbs] = createSignal<string[]>([])
	const [size, setSize] = createSignal(4096)
	const [busy, setBusy] = createSignal(false)
	const [toast, setToast] = createSignal('')
	const [error, setError] = createSignal('')

	let stage!: HTMLDivElement
	let canvas!: HTMLCanvasElement
	let paneEl!: HTMLDivElement
	let view: Renderer | undefined
	let off: Renderer | undefined
	let pane: Pane | undefined
	let phase: BindingApi | undefined
	const folders = new Map<string, FolderApi>()
	let box = { w: 0, h: 0 }
	let px: [number, number] = [1, 1]
	let shownAspect = ''
	let dirty = true

	/* ───────────── drawing ───────────── */

	/** Size the canvas to the largest box of the piece's aspect that fits the stage. */
	function fit() {
		shownAspect = params.aspect
		const [a, b] = params.aspect.split(':').map(Number)
		const w = Math.min(box.w, (box.h * a) / b)
		const h = (w * b) / a
		canvas.style.width = `${w}px`
		canvas.style.height = `${h}px`
		const dpr = Math.min(devicePixelRatio, 2)
		px = [Math.max(1, Math.round(w * dpr)), Math.max(1, Math.round(h * dpr))]
		dirty = true
	}

	const offscreen = () => (off ??= new Renderer(document.createElement('canvas'), true))

	function thumb(p: Params) {
		const r = offscreen()
		r.draw(p, ...dims(240, p))
		return r.canvas.toDataURL('image/jpeg', 0.85)
	}

	/* ───────────── state ───────────── */

	let hashTimer = 0
	function writeHash() {
		clearTimeout(hashTimer)
		const h = encode(params)
		history.replaceState(null, '', h ? `#${h}` : location.pathname)
	}
	const queueHash = () => {
		clearTimeout(hashTimer)
		hashTimer = window.setTimeout(writeHash, 300)
	}

	function showFolders() {
		for (const [group, f] of folders) {
			if (MODES.some((m) => m.id === group)) f.hidden = group !== params.mode
		}
		const light = folders.get('light')
		if (light) light.hidden = !LIT.includes(params.mode)
	}

	function apply(next: Partial<Params>) {
		Object.assign(params, next)
		setMode(params.mode)
		showFolders()
		pane?.refresh()
		fit()
		queueHash()
	}

	const pick = (p: Params, keys: Key[]) => Object.fromEntries(keys.map((k) => [k, p[k]])) as Partial<Params>

	let toastTimer = 0
	function notify(msg: string) {
		setToast(msg)
		clearTimeout(toastTimer)
		toastTimer = window.setTimeout(() => setToast(''), 1800)
	}

	/* ───────────── actions ───────────── */

	async function share() {
		writeHash()
		try {
			await navigator.clipboard.writeText(location.href)
			notify('Link copied')
		} catch {
			window.prompt('Copy this link:', location.href)
		}
	}

	async function save() {
		setBusy(true)
		// Let the busy state paint before the GPU blocks the page
		await new Promise((r) => setTimeout(r, 50))
		try {
			const out = offscreen().render(params, ...dims(size(), params))
			const blob = await new Promise<Blob | null>((res) => out.toBlob(res, 'image/png'))
			if (!blob) throw new Error('toBlob failed')
			const a = document.createElement('a')
			a.href = URL.createObjectURL(blob)
			a.download = `playground-${params.mode}-${params.seed}.png`
			a.click()
			setTimeout(() => URL.revokeObjectURL(a.href), 1000)
			notify('Saved')
		} catch {
			notify("Couldn't save — try a smaller size")
		} finally {
			setBusy(false)
		}
	}

	function storeFavs(list: Fav[]) {
		setFavs(list)
		try {
			localStorage.setItem(FAV_KEY, JSON.stringify(list))
		} catch {
			notify("Couldn't save — storage is full or turned off")
		}
	}
	function favourite() {
		const label = MODES.find((m) => m.id === params.mode)!.label
		const n = favs().filter((f) => f.params.mode === params.mode).length + 1
		const p = { ...params, animate: false }
		storeFavs([{ id: Date.now().toString(36), name: `${label} ${n}`, params: p, thumb: thumb(p) }, ...favs()])
		notify('Added to favourites')
	}
	const rename = (f: Fav, name: string) => storeFavs(favs().map((x) => (x === f ? { ...x, name } : x)))
	const remove = (f: Fav) => storeFavs(favs().filter((x) => x !== f))

	/* ───────────── setup ───────────── */

	onMount(() => {
		try {
			view = new Renderer(canvas)
		} catch (e) {
			setError((e as Error).message)
			return
		}

		pane = new Pane({ container: paneEl })
		for (const [key, s] of Object.entries(SPEC) as [Key, (typeof SPEC)[Key]][]) {
			if (key === 'mode') continue
			let f = folders.get(s.group)
			if (!f) folders.set(s.group, (f = pane.addFolder({ title: TITLES[s.group] })))
			const opts =
				'options' in s
					? { label: s.label, options: Object.fromEntries(s.options.map((o) => [o, o])) }
					: 'min' in s
						? { label: s.label, min: s.min, max: s.max, step: 'step' in s ? s.step : undefined }
						: { label: s.label }
			const b = f.addBinding(params, key, opts)
			if (key === 'phase') phase = b
		}
		showFolders()
		pane.on('change', () => {
			if (params.aspect !== shownAspect) fit()
			dirty = true
			queueHash()
		})

		const ro = new ResizeObserver(([e]) => {
			box = { w: e.contentRect.width, h: e.contentRect.height }
			fit()
		})
		ro.observe(stage)

		let raf = 0
		let last = performance.now()
		const frame = (now: number) => {
			raf = requestAnimationFrame(frame)
			const dt = Math.min((now - last) / 1000, 0.1)
			last = now
			if (params.animate) {
				params.phase = (params.phase + dt * params.speed) % 100
				phase?.refresh()
				dirty = true
			}
			if (!dirty || !view) return
			dirty = false
			try {
				view.draw(params, ...px)
			} catch (e) {
				setError((e as Error).message)
			}
		}
		raf = requestAnimationFrame(frame)

		const onHash = () => {
			const p = decode(location.hash.slice(1))
			if (p) apply(p)
		}
		addEventListener('hashchange', onHash)

		try {
			const list = JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') as Fav[]
			setFavs(list.map((f) => ({ id: String(f.id), name: String(f.name), thumb: String(f.thumb), params: sanitise(f.params) })))
		} catch {}
		// After the first frame, so the stage shows up before the thumbnails compile
		setTimeout(() => setThumbs(PRESETS.map((p) => thumb({ ...DEFAULTS, ...p.params }))), 100)

		onCleanup(() => {
			cancelAnimationFrame(raf)
			ro.disconnect()
			removeEventListener('hashchange', onHash)
			pane?.dispose()
			view?.dispose()
			off?.dispose()
		})
	})

	return (
		<div class="gs">
			<div class="gs-stage" ref={stage}>
				<canvas ref={canvas} class="gs-canvas" />
				<Show when={error()}>
					<p class="gs-error">
						<i class="ph ph-warning" /> {error()}
					</p>
				</Show>
			</div>

			<aside class="gs-side">
				<div class="gs-modes" role="radiogroup" aria-label="Mode">
					<For each={MODES}>
						{(m) => (
							<button
								type="button"
								role="radio"
								aria-checked={mode() === m.id}
								class="gs-mode"
								onClick={() => apply({ mode: m.id })}
							>
								<i class={`ph ${m.icon}`} aria-hidden="true" />
								{m.label}
							</button>
						)}
					</For>
				</div>

				<div class="gs-actions">
					<button type="button" class="zui-button zui-button-variant-outline" onClick={() => apply(randomise(params))}>
						<i class="ph ph-dice-five" aria-hidden="true" /> Random
					</button>
					<button type="button" class="zui-button zui-button-variant-outline" onClick={favourite}>
						<i class="ph ph-heart" aria-hidden="true" /> Favourite
					</button>
					<button type="button" class="zui-button zui-button-variant-outline" onClick={share}>
						<i class="ph ph-link" aria-hidden="true" /> Share
					</button>
					<div class="gs-save">
						<button type="button" class="zui-button" disabled={busy()} onClick={save}>
							<i class={`ph ${busy() ? 'ph-hourglass' : 'ph-download-simple'}`} aria-hidden="true" />
							{busy() ? 'Rendering…' : 'Save PNG'}
						</button>
						<select
							class="zui-select"
							aria-label="Image size (long edge)"
							onChange={(e) => setSize(Number(e.currentTarget.value))}
						>
							<For each={SIZES}>
								{(s) => (
									<option value={s} selected={s === size()}>
										{s}px
									</option>
								)}
							</For>
						</select>
					</div>
				</div>

				<div class="gs-pane" ref={paneEl} />

				<Show when={favs().length}>
					<section class="gs-shelf">
						<h2>
							<i class="ph ph-heart" aria-hidden="true" /> Favourites
						</h2>
						<ul class="gs-grid">
							<For each={favs()}>
								{(f) => (
									<li class="gs-card">
										<button type="button" class="gs-thumb" title="Apply everything" onClick={() => apply(f.params)}>
											<img src={f.thumb} alt="" />
										</button>
										<input
											class="gs-name"
											value={f.name}
											aria-label="Favourite name"
											onChange={(e) => rename(f, e.currentTarget.value)}
										/>
										<div class="gs-parts">
											<button type="button" title="Apply shape only" onClick={() => apply(pick(f.params, PARTS.shape(f.params)))}>
												<i class="ph ph-shapes" aria-hidden="true" />
												<span class="sr-only">Apply shape only</span>
											</button>
											<button type="button" title="Apply colours only" onClick={() => apply(pick(f.params, PARTS.colour()))}>
												<i class="ph ph-palette" aria-hidden="true" />
												<span class="sr-only">Apply colours only</span>
											</button>
											<button type="button" title="Apply finish only" onClick={() => apply(pick(f.params, PARTS.finish()))}>
												<i class="ph ph-film-strip" aria-hidden="true" />
												<span class="sr-only">Apply finish only</span>
											</button>
											<button type="button" title="Delete" onClick={() => remove(f)}>
												<i class="ph ph-trash" aria-hidden="true" />
												<span class="sr-only">Delete</span>
											</button>
										</div>
									</li>
								)}
							</For>
						</ul>
					</section>
				</Show>

				<section class="gs-shelf">
					<h2>
						<i class="ph ph-sparkle" aria-hidden="true" /> Starters
					</h2>
					<ul class="gs-grid">
						<For each={PRESETS}>
							{(p, i) => (
								<li class="gs-card">
									<button type="button" class="gs-thumb" onClick={() => apply({ ...DEFAULTS, ...p.params })}>
										<Show when={thumbs()[i()]} fallback={<span class="gs-thumb-empty" />}>
											<img src={thumbs()[i()]} alt="" />
										</Show>
										<span class="gs-name">{p.name}</span>
									</button>
								</li>
							)}
						</For>
					</ul>
				</section>
			</aside>

			<div class="gs-toast" role="status" aria-live="polite">
				{toast()}
			</div>
		</div>
	)
}
