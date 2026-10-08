/** @jsxImportSource solid-js */
import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { BufferTarget, Mp4OutputFormat, Output, Quality, VideoSample, VideoSampleSource, canEncodeVideo } from 'mediabunny'
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
	grab,
	nudged,
	randomise,
	sanitise,
	type Key,
	type Mode,
	type Params,
} from './engine'
import { Renderer } from './gl'

const yieldToPage = () =>
	new Promise<void>((r) => {
		const c = new MessageChannel()
		c.port1.onmessage = () => r()
		c.port2.postMessage(null)
	})

type Fav = { id: string; name: string; params: Params; thumb: string }
// Old name kept so favourites saved before the rename still load
const FAV_KEY = 'grain-studio-favourites'
const SIZES = [2048, 4096, 8192]
/** Video sizes as pixel counts, so every aspect gets the same detail as 16:9 at that size. */
const VIDEO_SIZES = [
	{ label: '1080p', area: 1920 * 1080 },
	{ label: '4K', area: 3840 * 2160 },
]
const FRAME_RATES = [30, 60]
/** Seconds per loop; 0 means one loop at the preview's Speed. */
const DURATIONS = [0, 5, 10, 20, 30]
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
	const [vSize, setVSize] = createSignal(VIDEO_SIZES[0].area)
	const [fps, setFps] = createSignal(30)
	const [duration, setDuration] = createSignal(10)
	/** 0–1 while a video renders, otherwise null. */
	const [progress, setProgress] = createSignal<number | null>(null)
	let cancelVideo = false
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

	const pick = (p: Params, keys: (keyof Params)[]) => Object.fromEntries(keys.map((k) => [k, p[k]])) as Partial<Params>

	let toastTimer = 0
	function notify(msg: string) {
		setToast(msg)
		clearTimeout(toastTimer)
		toastTimer = window.setTimeout(() => setToast(''), 1800)
	}

	/* ───────────── dragging ───────────── */

	/** The pointer in the shader's scene units: image height is 1, centre is 0, y up. */
	function at(e: PointerEvent): [number, number] {
		const r = canvas.getBoundingClientRect()
		return [(e.clientX - r.left - r.width / 2) / r.height, (r.height / 2 - e.clientY + r.top) / r.height]
	}
	let drag: { i: number; k: number; x: number; y: number } | null = null
	const under = (e: PointerEvent) => grab(params, px[0] / px[1], ...at(e))

	function onDown(e: PointerEvent) {
		const h = under(e)
		if (!h) return
		canvas.setPointerCapture(e.pointerId)
		const [x, y] = at(e)
		drag = { ...h, x, y }
		canvas.style.cursor = 'grabbing'
	}
	function onMove(e: PointerEvent) {
		if (!drag) {
			canvas.style.cursor = under(e) ? 'grab' : ''
			return
		}
		const [x, y] = at(e)
		params.nudge = nudged(params, drag.i, (x - drag.x) * drag.k, (y - drag.y) * drag.k)
		drag.x = x
		drag.y = y
		dirty = true
	}
	function onUp() {
		if (!drag) return
		drag = null
		canvas.style.cursor = 'grab'
		queueHash()
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
			download(blob, 'png')
		} catch {
			notify("Couldn't save — try a smaller size")
		} finally {
			setBusy(false)
		}
	}

	function download(blob: Blob, ext: string) {
		const a = document.createElement('a')
		a.href = URL.createObjectURL(blob)
		a.download = `playground-${params.mode}-${params.seed}.${ext}`
		a.click()
		setTimeout(() => URL.revokeObjectURL(a.href), 1000)
		notify('Saved')
	}

	/**
	 * One full Evolve loop, frame by frame, as an H.264 MP4. Frames are rendered
	 * offscreen, not recorded live, so slow scenes take longer but never drop frames.
	 */
	async function saveVideo() {
		const [a, b] = params.aspect.split(':').map(Number)
		// H.264 needs even sides
		const even = (n: number) => Math.round(n / 2) * 2
		const h = even(Math.sqrt((vSize() * b) / a))
		const w = even((h * a) / b)
		const rate = fps()
		const frames = Math.round((duration() || 100 / params.speed) * rate)
		// Grain is noise, and noise needs bits: about 0.3 bits per pixel
		const quality = new Quality({ bitrate: Math.min(w * h * rate * 0.3, 80e6) })
		if (!(await canEncodeVideo('avc', { width: w, height: h, quality, frameRate: rate }))) {
			notify(`This browser can't encode ${w}×${h} video — try 1080p`)
			return
		}
		// One full-size draw and one readPixels per frame. Measured at 1080p: about
		// 50ms a frame. The PNG tile path took 500ms, and handing the encoder the
		// WebGL canvas took 250ms whenever the tab was in the background.
		// Video stays ≤ 4K, inside the drawing-buffer limit, so no tiles are needed.
		const gl = new Renderer(document.createElement('canvas'))
		const buf = new Uint8Array(w * h * 4)
		gl.draw(params, w, h)
		if (gl.gl.drawingBufferWidth !== w || gl.gl.drawingBufferHeight !== h) {
			gl.dispose()
			notify(`This GPU can't draw ${w}×${h} — try 1080p`)
			return
		}
		const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() })
		const source = new VideoSampleSource({ codec: 'avc', quality })
		output.addVideoTrack(source, { frameRate: rate })
		cancelVideo = false
		setProgress(0)
		try {
			await output.start()
			const p = { ...params }
			const start = params.phase
			for (let i = 0; i < frames; i++) {
				if (cancelVideo) {
					await output.cancel()
					notify('Video cancelled')
					return
				}
				p.phase = (start + (i / frames) * 100) % 100
				gl.pixels(p, w, h, buf)
				const sample = new VideoSample(buf, { format: 'RGBA', codedWidth: w, codedHeight: h, timestamp: i / rate, duration: 1 / rate })
				await source.add(sample)
				sample.close()
				setProgress(i / frames)
				// Let the page paint progress and take a Cancel click. Not setTimeout:
				// background tabs slow that to once a second, and exports run long
				// enough that people switch tabs.
				if (i % 4 === 0) await yieldToPage()
			}
			await output.finalize()
			download(new Blob([output.target.buffer!], { type: 'video/mp4' }), 'mp4')
		} catch {
			notify("Couldn't save the video — try 1080p")
		} finally {
			gl.dispose()
			setProgress(null)
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
		for (const m of MODES) {
			if (m.id === 'folds') continue
			folders
				.get(m.id)
				?.addButton({ title: 'Reset positions' })
				.on('click', () => {
					params.nudge = { ...params.nudge, [m.id]: [] }
					dirty = true
					queueHash()
				})
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
				<canvas
					ref={canvas}
					class="gs-canvas"
					onPointerDown={onDown}
					onPointerMove={onMove}
					onPointerUp={onUp}
					onPointerCancel={onUp}
				/>
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
						<button type="button" class="zui-button" disabled={busy() || progress() !== null} onClick={save}>
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
					<div class="gs-video">
						<Show
							when={progress() !== null}
							fallback={
								<button type="button" class="zui-button" disabled={busy()} onClick={saveVideo}>
									<i class="ph ph-film-slate" aria-hidden="true" /> Save MP4
								</button>
							}
						>
							<button type="button" class="zui-button zui-button-variant-outline" onClick={() => (cancelVideo = true)}>
								<i class="ph ph-x" aria-hidden="true" /> Cancel · {Math.round(progress()! * 100)}%
							</button>
						</Show>
						<select class="zui-select" aria-label="Video size" onChange={(e) => setVSize(Number(e.currentTarget.value))}>
							<For each={VIDEO_SIZES}>
								{(v) => (
									<option value={v.area} selected={v.area === vSize()}>
										{v.label}
									</option>
								)}
							</For>
						</select>
						<select class="zui-select" aria-label="Frame rate" onChange={(e) => setFps(Number(e.currentTarget.value))}>
							<For each={FRAME_RATES}>
								{(r) => (
									<option value={r} selected={r === fps()}>
										{r} fps
									</option>
								)}
							</For>
						</select>
						<select
							class="zui-select"
							aria-label="Loop length"
							onChange={(e) => setDuration(Number(e.currentTarget.value))}
						>
							<For each={DURATIONS}>
								{(d) => (
									<option value={d} selected={d === duration()}>
										{d ? `${d}s loop` : 'Speed'}
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
