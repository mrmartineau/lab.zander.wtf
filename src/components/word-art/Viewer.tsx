/** @jsxImportSource solid-js */
import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js'
import { createStore, reconcile, unwrap } from 'solid-js/store'
import { clone, DEFAULT_STATE, decodeState, encodeState, loadFont, type WAState } from './engine'
import { saveStage } from './png'
import WordArt, { type WordArtApi } from './WordArt'

/**
 * The read-only, full-window view of a piece. Everything lives in the URL
 * hash, so the link *is* the saved artwork — no server, no account.
 */
export default function Viewer() {
	const [state, setState] = createStore<WAState>(clone(DEFAULT_STATE))
	const [found, setFound] = createSignal(true)
	const [fontTick, setFontTick] = createSignal(0)
	const [idle, setIdle] = createSignal(false)
	const [toast, setToast] = createSignal('')
	const [saving, setSaving] = createSignal(false)
	let stageEl!: HTMLDivElement
	let wordart: WordArtApi | undefined

	const read = () => {
		const s = decodeState(location.hash.slice(1))
		setFound(Boolean(s))
		setState(reconcile(s ?? clone(DEFAULT_STATE)))
	}

	createEffect(() => {
		document.title = `${state.text || 'WordArt'} — WordArt Studio`
		loadFont(state.font, state.weight).then(() => setFontTick((t) => t + 1))
	})

	let toastTimer = 0
	const notify = (msg: string) => {
		setToast(msg)
		clearTimeout(toastTimer)
		toastTimer = window.setTimeout(() => setToast(''), 1800)
	}

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(location.href)
			notify('Link copied!')
		} catch {
			notify("Couldn't copy — copy the address bar instead")
		}
	}

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

	const [full, setFull] = createSignal(false)
	async function toggleFull() {
		try {
			if (document.fullscreenElement) await document.exitFullscreen()
			else await document.documentElement.requestFullscreen()
		} catch {
			notify("This browser won't go full screen here")
		}
	}

	onMount(() => {
		read()
		addEventListener('hashchange', read)
		const onFonts = () => setFontTick((t) => t + 1)
		document.fonts.addEventListener('loadingdone', onFonts)
		const onFull = () => setFull(Boolean(document.fullscreenElement))
		document.addEventListener('fullscreenchange', onFull)

		// Controls fade away so the artwork is all you see; any movement brings them back
		let idleTimer = 0
		const wake = () => {
			setIdle(false)
			clearTimeout(idleTimer)
			idleTimer = window.setTimeout(() => setIdle(true), 2500)
		}
		wake()
		for (const ev of ['pointermove', 'pointerdown', 'keydown'] as const) addEventListener(ev, wake)

		onCleanup(() => {
			removeEventListener('hashchange', read)
			document.fonts.removeEventListener('loadingdone', onFonts)
			document.removeEventListener('fullscreenchange', onFull)
			for (const ev of ['pointermove', 'pointerdown', 'keydown'] as const) removeEventListener(ev, wake)
		})
	})

	return (
		<div ref={stageEl} class="wa-stage wa-view" classList={{ 'is-idle': idle() }} data-bg={state.bg}>
			<WordArt
				class="wa-stage-inner"
				state={state}
				fontTick={fontTick()}
				maxScale={6}
				ref={(api) => (wordart = api)}
			/>

			<nav class="wa-view-bar" aria-label="Viewer controls">
				<a class="wa-view-btn" href={found() ? `/word-art#${encodeState(state)}` : '/word-art'}>
					<i class="ph ph-pencil-simple" /> {found() ? 'Edit this' : 'Make your own'}
				</a>
				<button type="button" class="wa-view-btn" onClick={copyLink}>
					<i class="ph ph-link" /> Copy link
				</button>
				<button type="button" class="wa-view-btn" disabled={saving()} onClick={savePicture}>
					<i class={`ph ${saving() ? 'ph-spinner wa-spin' : 'ph-image'}`} /> Save PNG
				</button>
				<Show when={document.documentElement.requestFullscreen}>
					<button
						type="button"
						class="wa-view-btn"
						aria-label={full() ? 'Exit full screen' : 'Full screen'}
						title={full() ? 'Exit full screen' : 'Full screen'}
						aria-pressed={full()}
						onClick={toggleFull}
					>
						<i class={`ph ${full() ? 'ph-corners-in' : 'ph-corners-out'}`} />
					</button>
				</Show>
			</nav>

			<div class={`wa-toast${toast() ? ' is-on' : ''}`} role="status" aria-live="polite">
				{toast()}
			</div>
		</div>
	)
}
