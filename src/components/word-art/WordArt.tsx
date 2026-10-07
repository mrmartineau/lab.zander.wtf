/** @jsxImportSource solid-js */
import { createEffect, createMemo, createSignal, Index, on, onCleanup, onMount } from 'solid-js'
import { baseCss, bounds, label, layout, rootVars, splitText, type LetterGeo, type Metrics, type WAState } from './engine'

let uid = 0

export interface WordArtApi {
	chars: () => string[]
	/** Line breaks before each letter */
	brs: () => number[]
	geo: () => LetterGeo[]
	wEm: () => number
	metrics: () => Metrics
	/** A springy entrance, for when the whole style changes at once. */
	pop: () => void
}

/**
 * Live WordArt. Letters are persistent DOM nodes (one per grapheme position),
 * so slider changes only patch inline styles — nothing is rebuilt and running
 * animations carry on. Flat letter widths are re-measured only when something
 * that affects them changes (text, font, size, weight, spacing).
 */
export default function WordArt(props: {
	state: WAState
	/** Largest zoom when fitting into the host. */
	maxScale?: number
	/** Bumped by the parent when web fonts finish loading. */
	fontTick?: number
	class?: string
	ref?: (api: WordArtApi) => void
}) {
	const id = `wa-${++uid}`
	let host!: HTMLDivElement
	let root!: HTMLSpanElement

	const split = createMemo(() => splitText(props.state.text))
	const chars = () => split().chars
	const brs = () => split().brs
	const [metrics, setMetrics] = createSignal<Metrics>({ lefts: [], widths: [], tops: [], line: [], lh: 1, W: 1, H: 1 })
	const [box, setBox] = createSignal({ w: 0, h: 0 })

	const geo = createMemo(() => layout(props.state, metrics()))
	const wEm = createMemo(() => metrics().W / props.state.size)
	const vars = createMemo(() => rootVars(props.state, wEm()))
	const css = createMemo(() => baseCss(`.${id}`, props.state.anim, id))

	const measure = () => {
		const spans = [...root.querySelectorAll<HTMLElement>(':scope > span')]
		let n = 0
		// offsetLeft/Width ignore transforms, so the bent word measures as flat
		setMetrics({
			lefts: spans.map((el) => el.offsetLeft),
			widths: spans.map((el) => el.offsetWidth),
			tops: spans.map((el) => el.offsetTop),
			line: brs().map((b) => (n += b ? 1 : 0)),
			lh: spans[0]?.offsetHeight || props.state.size,
			W: root.offsetWidth || 1,
			H: root.offsetHeight || props.state.size,
		})
	}

	// Anything that changes glyph widths → re-measure after the DOM updates
	createEffect(
		on(
			() => [
				props.state.text,
				props.state.font,
				props.state.size,
				props.state.weight,
				props.state.spacing,
				props.fontTick,
			],
			() => measure(),
		),
	)

	onMount(() => {
		const ro = new ResizeObserver(() => setBox({ w: host.clientWidth, h: host.clientHeight }))
		ro.observe(host)
		onCleanup(() => ro.disconnect())
		props.ref?.({
			chars,
			brs,
			geo,
			wEm,
			metrics,
			pop: () =>
				!matchMedia('(prefers-reduced-motion: reduce)').matches &&
				root.animate([{ scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1 }], {
					duration: 500,
					easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
				}),
		})
	})

	const fit = createMemo(() => {
		const { w, h } = box()
		const b = bounds(props.state, metrics(), geo())
		if (!b || !w || !h) return 'none'
		const pad = Math.min(w, h) * 0.08
		const scale = Math.max(
			0.01,
			Math.min(props.maxScale ?? 1, (w - pad * 2) / (b.x1 - b.x0), (h - pad * 2) / (b.y1 - b.y0)),
		)
		const cx = (b.x0 + b.x1) / 2
		const cy = (b.y0 + b.y1) / 2
		return `translate(${w / 2 - cx * scale}px, ${h / 2 - cy * scale}px) scale(${scale})`
	})

	return (
		<div ref={host} class={props.class}>
			<style>{css()}</style>
			<div class="wa-fit" style={{ transform: fit() }}>
				<span ref={root} class={id} role="img" aria-label={label(props.state.text)} style={vars()}>
					<Index each={chars()}>
						{(c, i) => (
							<>
							{Array.from({ length: brs()[i] ?? 0 }, () => <br />)}
							<span data-c={c()} style={geo()[i]?.style ?? `--i:${i};--x:0em`} aria-hidden="true">
								<span>{c()}</span>
							</span>
							</>
						)}
					</Index>
				</span>
			</div>
		</div>
	)
}
