/** @jsxImportSource solid-js */
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import {
	type Level,
	type Plan,
	ROOM_FIELDS,
	type Room,
	type SavedPlan,
	TYPES,
	TYPE_KEYS,
	type TypeKey,
	WALLS,
	type WallKey,
	boards,
	clampY,
	clearances,
	clone,
	defaultPlan,
	fmt,
	gapAbove,
	loadCurrent,
	loadSaved,
	normalise,
	notes,
	saveCurrent,
	sortLevels,
	writeSaved,
} from './model'
import { PantryScene, type View } from './scene'

/** A number box that only commits on change, clamped and rounded to half a cm. */
function NumField(props: {
	id: string
	label: string
	value: number
	min: number
	max: number
	color?: string
	onCommit: (v: number) => void
}) {
	let input!: HTMLInputElement
	const commit = () => {
		const v = Number.parseFloat(input.value)
		if (Number.isFinite(v)) props.onCommit(Math.min(props.max, Math.max(props.min, Math.round(v * 2) / 2)))
		input.value = fmt(props.value)
	}
	createEffect(() => {
		if (document.activeElement !== input) input.value = fmt(props.value)
	})
	return (
		<label class="pp-num" for={props.id}>
			<span class="pp-num-label">{props.label}</span>
			<span class="pp-num-box" style={{ 'border-inline-start-color': props.color ? `var(${props.color})` : undefined }}>
				<input ref={input} id={props.id} type="number" inputmode="decimal" step="0.5" min={props.min} max={props.max} onChange={commit} />
				<span>cm</span>
			</span>
		</label>
	)
}

export default function Planner() {
	const [plan, setPlan] = createSignal<Plan>(defaultPlan())
	const [selId, setSelId] = createSignal<number | null>(null)
	const [saved, setSaved] = createSignal<Record<string, SavedPlan>>({})
	const [name, setName] = createSignal('')
	const [nameError, setNameError] = createSignal('')
	const [pendingDelete, setPendingDelete] = createSignal<string | null>(null)
	const [pendingOverwrite, setPendingOverwrite] = createSignal<string | null>(null)
	const [pendingReset, setPendingReset] = createSignal(false)
	let resetTimer: ReturnType<typeof setTimeout> | undefined
	let warnedStorage = false
	const [toast, setToast] = createSignal('')
	let stage!: HTMLDivElement
	let scene: PantryScene | undefined
	let toastTimer: ReturnType<typeof setTimeout> | undefined

	const levels = createMemo(() => sortLevels(plan().levels))
	const selIndex = createMemo(() => levels().findIndex((l) => l.id === selId()))
	const allBoards = createMemo(() => boards(plan()))
	const totalRun = createMemo(() => allBoards().reduce((a, b) => a + b.len, 0))
	const clear = createMemo(() => clearances(plan()))

	const say = (msg: string) => {
		setToast(msg)
		clearTimeout(toastTimer)
		toastTimer = setTimeout(() => setToast(''), 2600)
	}

	/**
	 * Keep the current plan in storage, and say once if the browser won't keep it.
	 * Returns false when it isn't stored, so callers don't report success over the warning.
	 */
	const persist = (p: Plan) => {
		if (saveCurrent(p)) return true
		if (!warnedStorage) {
			warnedStorage = true
			say("This browser isn't keeping your plan. Changes will be lost on reload, so save a PDF before you leave.")
		}
		return false
	}

	/**
	 * Every edit goes through here: copy, change, re-sort, persist. Level rows are rebuilt from the
	 * copy, so whichever control had focus is focused again by id once the new row is in place.
	 */
	const edit = (fn: (p: Plan) => void) => {
		const focusedId = (document.activeElement as HTMLElement | null)?.id
		const next = clone(plan())
		fn(next)
		next.levels = sortLevels(next.levels)
		setPlan(next)
		persist(next)
		if (focusedId) queueMicrotask(() => document.getElementById(focusedId)?.focus())
	}
	const editLevel = (id: number | undefined, fn: (l: Level) => void) =>
		edit((p) => {
			const l = p.levels.find((x) => x.id === id)
			if (l) fn(l)
		})
	const setRoom = (k: keyof Room, v: number) =>
		edit((p) => {
			p.room[k] = v
			// Keep at least 10cm of opening between the returns.
			if (k === 'ret' || k === 'w') p.room.ret = Math.max(0, Math.min(p.room.ret, p.room.w - p.room.retR - 10))
			if (k === 'retR' || k === 'w') p.room.retR = Math.max(0, Math.min(p.room.retR, p.room.w - p.room.ret - 10))
			for (const l of p.levels) l.y = clampY(p.room, l.y)
		})

	const addLevel = () =>
		edit((p) => {
			const lv = sortLevels(p.levels)
			let best = 0
			let y = 40
			for (let i = 0; i <= lv.length; i++) {
				const lo = i ? lv[i - 1].y : 0
				const hi = i < lv.length ? lv[i].y : p.room.h
				if (hi - lo > best) {
					best = hi - lo
					y = (lo + hi) / 2
				}
			}
			const id = Date.now()
			p.levels.push({ id, y: clampY(p.room, y), L: 'sm', B: 'lg', R: 'lg', D: '' })
			setSelId(id)
		})
	const spaceEvenly = () =>
		edit((p) => {
			const lv = sortLevels(p.levels)
			if (lv.length < 2) return
			const lo = lv[0].y
			const hi = lv[lv.length - 1].y
			lv.forEach((l, i) => {
				l.y = clampY(p.room, lo + ((hi - lo) * i) / (lv.length - 1))
			})
			p.levels = lv
		})
	/** Two clicks, like delete: the current plan has no undo. */
	const resetAll = () => {
		clearTimeout(resetTimer)
		if (!pendingReset()) {
			setPendingReset(true)
			resetTimer = setTimeout(() => setPendingReset(false), 4000)
			return
		}
		setPendingReset(false)
		const p = defaultPlan()
		setPlan(p)
		persist(p)
		setSelId(null)
		setName('')
		setPendingOverwrite(null)
		setPendingDelete(null)
	}

	const savePlan = () => {
		const n = name().trim()
		if (!n) {
			setNameError('Enter a name first')
			return
		}
		if (Object.prototype.hasOwnProperty.call(saved(), n) && pendingOverwrite() !== n) {
			setPendingOverwrite(n)
			return
		}
		setPendingOverwrite(null)
		const next = { ...saved(), [n]: { ...clone(plan()), at: Date.now() } }
		if (!writeSaved(next)) {
			setNameError("This browser isn't letting the page store plans. Try a normal (not private) window.")
			return
		}
		setSaved(next)
		setPendingDelete(null)
		say(`Saved "${n}"`)
	}
	const loadPlan = (n: string) => {
		const p = normalise(saved()[n])
		setPlan(p)
		const stored = persist(p)
		setSelId(null)
		setName(n)
		setPendingOverwrite(null)
		say(stored ? `Loaded "${n}"` : `Loaded "${n}", but this browser won't keep it after a reload.`)
	}
	const deletePlan = (n: string) => {
		if (pendingDelete() !== n) {
			setPendingDelete(n)
			return
		}
		const next = { ...saved() }
		delete next[n]
		if (!writeSaved(next)) {
			say("Couldn't delete it here. This browser isn't letting the page change saved plans.")
			setPendingDelete(null)
			return
		}
		setSaved(next)
		setPendingDelete(null)
	}
	const savedNames = createMemo(() => Object.keys(saved()).sort((a, b) => saved()[b].at - saved()[a].at))

	const cutText = () =>
		`Pantry shelves (${fmt(plan().room.th * 10)}mm boards)\n${allBoards()
			.map((b) => `L${b.i + 1} @ ${fmt(b.y)}cm  ${b.wall.padEnd(9)}  ${TYPES[b.t].name.padEnd(9)}  ${fmt(b.len)} x ${fmt(b.d)}cm`)
			.join('\n')}`
	const copyCutList = async () => {
		try {
			await navigator.clipboard.writeText(cutText())
			say('Copied')
		} catch {
			say('Copy blocked here. Select the table and copy it.')
		}
	}
	const downloadPdf = async () => {
		try {
			const { savePdf } = await import('./pdf')
			await savePdf(plan(), name().trim(), scene?.snapshot())
		} catch {
			say("Couldn't make the PDF. Reload the page and try again.")
		}
	}

	onMount(() => {
		setPlan(loadCurrent())
		setSaved(loadSaved())
		scene = new PantryScene(stage, (i) => {
			const l = levels()[i]
			if (!l) return
			setSelId(l.id ?? null)
			if (window.innerWidth < 920) {
				document
					.querySelector(`[data-level="${l.id}"]`)
					?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
			}
		})
	})
	onCleanup(() => scene?.dispose())
	createEffect(() => scene?.setPlan(plan(), selIndex(), false))

	const typeOptions = () =>
		TYPE_KEYS.map((t) => (
			<option value={t}>
				{TYPES[t].name} {fmt(plan().depths[t])}
			</option>
		))

	return (
		<div class="pp-grid">
			<div class="pp-stagecol">
				<div class="pp-stage" ref={stage}>
					<div class="pp-views">
						<For each={[['front', 'Doorway'], ['top', 'Above'], ['side', 'Side']] as [View, string][]}>
							{([v, label]) => (
								<button class="zui-button zui-button-variant-outline zui-button-size-xs" type="button" onClick={() => scene?.setView(v)}>
									{label}
								</button>
							)}
						</For>
					</div>
				</div>
				<p class="pp-hint">Drag to rotate. Pinch or scroll to zoom. Tap a shelf to jump to its level.</p>
				<div class="pp-legend">
					<For each={TYPE_KEYS}>
						{(t) => (
							<span>
								<i class="pp-swatch" style={{ background: `var(${TYPES[t].color})` }} />
								{TYPES[t].name} · {fmt(plan().depths[t])}cm
							</span>
						)}
					</For>
					<span>
						<i class="pp-swatch" style={{ background: 'var(--color-text)' }} />
						Light switch
					</span>
				</div>
				<div class="pp-stats">
					<div>
						<small>Walkway at floor</small>
						<b>{fmt(clear().walk)}cm</b>
					</div>
					<div>
						<small>Standing depth</small>
						<b>{fmt(clear().depth)}cm</b>
					</div>
					<div>
						<small>Shelf run</small>
						<b>{fmt(totalRun() / 100)}m</b>
					</div>
				</div>
			</div>

			<div class="pp-panels">
				<section class="pp-card">
					<h2>Saved plans</h2>
					<p class="pp-sub">Stored in this browser only. Your current plan is kept automatically.</p>
					<div class="pp-save">
						<label class="pp-num" for="pp-name" style={{ flex: '1 1 12rem' }}>
							<span class="pp-num-label">Name this plan</span>
							<input
								id="pp-name"
								class="zui-input"
								type="text"
								maxlength="60"
								placeholder="Shallow left, deep back"
								value={name()}
								onInput={(e) => {
									setName(e.currentTarget.value)
									setNameError('')
									setPendingOverwrite(null)
								}}
							/>
						</label>
						<button class="zui-button zui-button-color-accent" type="button" onClick={savePlan}>
							{pendingOverwrite() ? 'Replace saved plan' : 'Save plan'}
						</button>
					</div>
					<Show when={pendingOverwrite()}>
						<p class="pp-sub" role="status">
							"{pendingOverwrite()}" is already saved. Click again to replace it.
						</p>
					</Show>
					<Show when={nameError()}>
						<p class="pp-error" role="alert">
							{nameError()}
						</p>
					</Show>
					<Show when={savedNames().length} fallback={<p class="pp-empty">No saved plans yet. Name the current setup and save it to compare later.</p>}>
						<ul class="pp-saved">
							<For each={savedNames()}>
								{(n) => (
									<li>
										<b>{n}</b>
										<small>
											{saved()[n].levels.length} levels ·{' '}
											{new Date(saved()[n].at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
										</small>
										<button class="zui-button zui-button-variant-outline zui-button-size-sm" type="button" onClick={() => loadPlan(n)}>
											Load
										</button>
										<button
											class={`zui-button zui-button-size-sm ${pendingDelete() === n ? 'zui-button-color-destructive' : 'zui-button-variant-ghost'}`}
											type="button"
											onClick={() => deletePlan(n)}
										>
											{pendingDelete() === n ? 'Confirm delete' : 'Delete'}
										</button>
									</li>
								)}
							</For>
						</ul>
					</Show>
				</section>

				<section class="pp-card">
					<h2>Room</h2>
					<p class="pp-sub">
						Wall depths run to the front of the opening. Returns are the short walls beside each door: width runs across, depth front to
						back. Side shelves stop at the back of a return, minus that side's setback. Set a return width to 0 if there isn't one.
					</p>
					<div class="pp-cells">
						<For each={ROOM_FIELDS}>
							{([k, label, [min, max]]) => (
								<NumField id={`pp-room-${k}`} label={label} value={plan().room[k]} min={min} max={max} onCommit={(v) => setRoom(k, v)} />
							)}
						</For>
					</div>
				</section>

				<section class="pp-card">
					<h2>Shelf sizes</h2>
					<p class="pp-sub">Depth front to back for each size. Changing one updates every shelf of that size.</p>
					<div class="pp-cells">
						<For each={TYPE_KEYS}>
							{(t: TypeKey) => (
								<NumField
									id={`pp-depth-${t}`}
									label={TYPES[t].name}
									value={plan().depths[t]}
									min={5}
									max={60}
									color={TYPES[t].color}
									onCommit={(v) => edit((p) => (p.depths[t] = v))}
								/>
							)}
						</For>
					</div>
				</section>

				<section class="pp-card">
					<h2>Levels</h2>
					<p class="pp-sub">
						Every shelf on a level sits at the same height on all walls. Heights are to the top of the shelf. Gap is the clear height above
						it. Over-door shelves only go above {fmt(plan().room.doorMin)}cm.
					</p>
					<For each={[...levels()].reverse()}>
						{(l) => {
							const i = () => levels().findIndex((x) => x.id === l.id)
							const gap = () => gapAbove(plan(), i())
							return (
								<div class="pp-level" classList={{ 'is-selected': selId() === l.id }} data-level={l.id} onFocusIn={() => setSelId(l.id ?? null)}>
									<div class="pp-level-top">
										<span class="pp-level-num">{i() + 1}</span>
										<div class="pp-height">
											<button type="button" id={`pp-${l.id}-down`} aria-label="Down 5cm" onClick={() => editLevel(l.id, (x) => (x.y = clampY(plan().room, x.y - 5)))}>
												<i class="ph ph-minus" aria-hidden="true" />
											</button>
											<input
												type="number"
												step="0.5"
												id={`pp-${l.id}-y`}
												aria-label={`Level ${i() + 1} height in cm`}
												value={fmt(l.y)}
												onChange={(e) => {
													const v = Number.parseFloat(e.currentTarget.value)
													if (Number.isFinite(v)) editLevel(l.id, (x) => (x.y = clampY(plan().room, v)))
													else e.currentTarget.value = fmt(l.y)
												}}
											/>
											<button type="button" id={`pp-${l.id}-up`} aria-label="Up 5cm" onClick={() => editLevel(l.id, (x) => (x.y = clampY(plan().room, x.y + 5)))}>
												<i class="ph ph-plus" aria-hidden="true" />
											</button>
										</div>
										<span class="pp-gap" classList={{ 'is-tight': gap() < 20 }}>
											gap {fmt(gap())}cm
										</span>
										<button
											class="zui-button zui-button-variant-ghost zui-button-size-xs pp-remove"
											type="button"
											aria-label={`Remove level ${i() + 1}`}
											onClick={() => edit((p) => (p.levels = p.levels.filter((x) => x.id !== l.id)))}
										>
											<i class="ph ph-trash" aria-hidden="true" />
										</button>
									</div>
									<div class="pp-cells pp-cells-4">
										<For each={WALLS}>
											{([k, label]: [WallKey, string]) => {
												const disabled = () => k === 'D' && l.y < plan().room.doorMin
												return (
													<label class="pp-num" for={`pp-${l.id}-${k}`}>
														<span class="pp-num-label">{label}</span>
														<select
															id={`pp-${l.id}-${k}`}
															class="zui-select pp-select"
															disabled={disabled()}
															style={{ 'border-inline-start-color': l[k] && !disabled() ? `var(${TYPES[l[k] as TypeKey].color})` : undefined }}
															value={l[k]}
															onChange={(e) => editLevel(l.id, (x) => (x[k] = e.currentTarget.value as TypeKey | ''))}
														>
															<option value="">None</option>
															{typeOptions()}
														</select>
													</label>
												)
											}}
										</For>
									</div>
								</div>
							)
						}}
					</For>
					<div class="pp-row">
						<button class="zui-button zui-button-color-accent" type="button" onClick={addLevel}>
							Add level
						</button>
						<button class="zui-button zui-button-variant-outline" type="button" onClick={spaceEvenly}>
							Space evenly
						</button>
						<button
							class={`zui-button ${pendingReset() ? 'zui-button-color-destructive' : 'zui-button-variant-ghost'}`}
							type="button"
							onClick={resetAll}
						>
							{pendingReset() ? 'Confirm reset' : 'Reset to starting plan'}
						</button>
					</div>
				</section>

				<section class="pp-card">
					<h2>Cut list</h2>
					<p class="pp-sub">
						Length × depth for each board, {fmt(plan().room.th * 10)}mm thick. Back shelves fit between the side shelves on the same level.
					</p>
					<div class="pp-tablewrap">
						<table>
							<thead>
								<tr>
									<th>Level</th>
									<th>Height</th>
									<th>Wall</th>
									<th>Size</th>
									<th>Length</th>
									<th>Depth</th>
								</tr>
							</thead>
							<tbody>
								<For each={allBoards()}>
									{(b) => (
										<tr>
											<td class="pp-mono">{b.i + 1}</td>
											<td class="pp-mono">{fmt(b.y)}cm</td>
											<td>{b.wall}</td>
											<td>
												<i class="pp-swatch" style={{ background: `var(${TYPES[b.t].color})` }} />
												{TYPES[b.t].name}
											</td>
											<td class="pp-mono">{fmt(b.len)}cm</td>
											<td class="pp-mono">{fmt(b.d)}cm</td>
										</tr>
									)}
								</For>
							</tbody>
							<tfoot>
								<tr>
									<td colspan="4">{allBoards().length} boards</td>
									<td class="pp-mono" colspan="2">
										{fmt(totalRun() / 100)}m total
									</td>
								</tr>
							</tfoot>
						</table>
					</div>
					<div class="pp-row">
						<button class="zui-button zui-button-color-accent" type="button" onClick={downloadPdf}>
							<i class="ph ph-file-pdf" aria-hidden="true" /> Save as PDF
						</button>
						<button class="zui-button zui-button-variant-outline" type="button" onClick={copyCutList}>
							<i class="ph ph-copy" aria-hidden="true" /> Copy cut list
						</button>
					</div>
					<p class="pp-toast" role="status">
						{toast()}
					</p>
					<ul class="pp-notes">
						<For each={notes(plan().room)}>{(n) => <li>{n}</li>}</For>
					</ul>
				</section>
			</div>
		</div>
	)
}
