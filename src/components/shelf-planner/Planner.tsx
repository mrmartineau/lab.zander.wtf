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
	decodeShare,
	encodeShare,
	shareCodeFrom,
	defaultPlan,
	fixings,
	fmt,
	gapAbove,
	BRACKET_END,
	BRACKET_GAP,
	groupLengths,
	widthTotals,
	joinNote,
	HEAD,
	STOCK,
	loadCurrent,
	loadSaved,
	normalise,
	notes,
	saveCurrent,
	sortLevels,
	writeSaved,
} from './model'
import { type Fixings, type Highlight, ShelfScene, type View } from './scene'

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
		<label class="sp-num" for={props.id}>
			<span class="sp-num-label">{props.label}</span>
			<span class="sp-num-box" style={{ 'border-inline-start-color': props.color ? `var(${props.color})` : undefined }}>
				<input ref={input} id={props.id} type="number" inputmode="decimal" step="0.5" min={props.min} max={props.max} onChange={commit} />
				<span>cm</span>
			</span>
		</label>
	)
}

export default function Planner() {
	const [plan, setPlan] = createSignal<Plan>(defaultPlan())
	const [fixings3d, setFixings3d] = createSignal<Fixings>('none')
	const [selId, setSelId] = createSignal<number | null>(null)
	const [saved, setSaved] = createSignal<Record<string, SavedPlan>>({})
	const [name, setName] = createSignal('')
	const [nameError, setNameError] = createSignal('')
	const [pendingDelete, setPendingDelete] = createSignal<string | null>(null)
	const [pendingOverwrite, setPendingOverwrite] = createSignal<string | null>(null)
	const [pendingReset, setPendingReset] = createSignal(false)
	/** Name of the shared plan on screen while it's only in the link, not yet in this browser. */
	const [sharedName, setSharedName] = createSignal<string | null>(null)
	const [copied, setCopied] = createSignal<string | null>(null)
	let copiedTimer: ReturnType<typeof setTimeout> | undefined
	let resetTimer: ReturnType<typeof setTimeout> | undefined
	let warnedStorage = false
	const [toast, setToast] = createSignal('')
	const [isFull, setIsFull] = createSignal(false)
	let stage!: HTMLDivElement
	let scene: ShelfScene | undefined
	let toastTimer: ReturnType<typeof setTimeout> | undefined

	const levels = createMemo(() => sortLevels(plan().levels))
	// Rows are keyed by id, so an edit updates the row in place instead of rebuilding every row.
	const levelIds = createMemo(() => levels().map((l) => l.id).reverse())
	const selIndex = createMemo(() => levels().findIndex((l) => l.id === selId()))
	const allBoards = createMemo(() => boards(plan()))
	const totals = createMemo(() => widthTotals(allBoards()))
	const totalRun = createMemo(() => allBoards().reduce((a, b) => a + b.len, 0))
	const clear = createMemo(() => clearances(plan()))
	const fix = createMemo(() => fixings(plan()))
	const bracketRule = `2 per shelf up to ${fmt(2 * BRACKET_END + BRACKET_GAP)}cm long, 3 or more over that (at most ${BRACKET_GAP}cm apart). Add screws and wall plugs for each.`
	const battenText = () =>
		`${fix().stock} × ${fmt(STOCK / 100)}m lengths. Cut ${groupLengths(fix().battens) || 'nothing yet'}.${joinNote(fix().battens)}`

	const say = (msg: string) => {
		setToast(msg)
		clearTimeout(toastTimer)
		toastTimer = setTimeout(() => setToast(''), 2600)
	}

	/** Once a shared plan is saved or edited it belongs to this browser, so drop the link from the address bar. */
	const leaveShared = () => {
		if (sharedName() === null) return
		history.replaceState(null, '', location.pathname + location.search)
		setSharedName(null)
	}
	/**
	 * Keep the current plan in storage, and say once if the browser won't keep it.
	 * Returns false when it isn't stored, so callers don't report success over the warning.
	 * A shared link only leaves the address bar once the plan is safely stored, so it stays recoverable.
	 */
	const persist = (p: Plan) => {
		if (saveCurrent(p)) {
			leaveShared()
			return true
		}
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
		if (focusedId) queueMicrotask(() => document.getElementById(focusedId)?.focus({ preventScroll: true }))
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
		// A saved shared plan becomes this browser's current plan too, so a reload still shows it.
		const stored = persist(plan())
		say(stored ? `Saved "${n}"` : `Saved "${n}" to the list, but this browser won't keep it after a reload.`)
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
	const sharePlan = async (n: string) => {
		const url = `${location.origin}/shelf-planner/p/${encodeShare(n, saved()[n])}`
		try {
			await navigator.clipboard.writeText(url)
			setCopied(n)
			clearTimeout(copiedTimer)
			copiedTimer = setTimeout(() => setCopied(null), 2000)
		} catch {
			window.prompt('Copy this link to share the plan', url)
		}
	}
	const savedNames = createMemo(() => Object.keys(saved()).sort((a, b) => saved()[b].at - saved()[a].at))

	const cutText = () =>
		`Shelves (${fmt(plan().room.th * 10)}mm boards)\n${allBoards()
			.map((b) => `L${b.i + 1} @ ${fmt(b.y)}cm  ${b.wall.padEnd(9)}  ${TYPES[b.t].name.padEnd(9)}  ${fmt(b.len)} x ${fmt(b.d)}cm`)
			.join('\n')}\n\nBy board width\n${totals()
			.map((w) => `${fmt(w.d)}cm wide  ${w.count} boards  ${fmt(w.run / 100)}m  (${w.stock} x ${fmt(STOCK / 100)}m lengths)`)
			.join('\n')}\n\nBrackets only: ${fix().brackets}\n${fix().battensOnly ? `Battens only: ${groupLengths(fix().battens)} (${fix().stock} x ${fmt(STOCK / 100)}m lengths)${joinNote(fix().battens)}` : 'Battens only: not possible, some shelves have no wall at their ends'}\nMix: battens ${groupLengths(fix().battens) || 'none'} (${fix().stock} x ${fmt(STOCK / 100)}m lengths)${joinNote(fix().battens)}, plus ${fix().mixBrackets} brackets`
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
		// A share link shows its plan without storing it, so opening one never replaces the plan kept here.
		const shared = decodeShare(shareCodeFrom(location.pathname + location.search + location.hash))
		setPlan(shared ? shared.plan : loadCurrent())
		if (shared) {
			setName(shared.name)
			setSharedName(shared.name)
		}
		setSaved(loadSaved())
		// Pasting a different share link into this tab only changes the hash, so load it properly.
		addEventListener('hashchange', () => location.reload())
		scene = new ShelfScene(stage, (i) => {
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

	const onFullscreen = () => setIsFull(document.fullscreenElement === stage)
	document.addEventListener('fullscreenchange', onFullscreen)
	onCleanup(() => document.removeEventListener('fullscreenchange', onFullscreen))
	const toggleFullscreen = () =>
		(document.fullscreenElement ? document.exitFullscreen() : stage.requestFullscreen()).catch(() =>
			say("This browser won't show the 3D view full screen."),
		)
	createEffect(() => scene?.setPlan(plan(), selIndex(), false))
	// Battens alone stop working once a back shelf ends up between two side shelves.
	createEffect(() => fixings3d() === 'battens' && !fix().battensOnly && setFixings3d('mix'))
	createEffect(() => scene?.setFixings(fixings3d()))

	/** Hover or focus a figure to see what it measures in the 3D view. Focus makes it work by tap and keyboard too. */
	const shows = (h: Highlight) => ({
		tabindex: 0,
		onPointerEnter: () => scene?.setHighlight(h),
		onPointerLeave: () => scene?.setHighlight(null),
		onFocus: () => scene?.setHighlight(h),
		onBlur: () => scene?.setHighlight(null),
	})

	/** One set of options per select, made once; only the depth text updates. */
	const typeOptions = () => (
		<For each={TYPE_KEYS}>
			{(t) => (
				<option value={t}>
					{TYPES[t].name} {fmt(plan().depths[t])}
				</option>
			)}
		</For>
	)

	return (
		<div class="sp-grid">
			<div class="sp-stagecol">
				<div class="sp-stage" ref={stage}>
					<div class="sp-views">
						<For each={[['front', 'Doorway'], ['top', 'Above'], ['side', 'Side']] as [View, string][]}>
							{([v, label]) => (
								<button class="zui-button zui-button-variant-outline zui-button-size-xs" type="button" onClick={() => scene?.setView(v)}>
									{label}
								</button>
							)}
						</For>
						<Show when={document.fullscreenEnabled}>
							<button
								class="zui-button zui-button-variant-outline zui-button-size-xs"
								type="button"
								aria-label="Full screen"
								aria-pressed={isFull()}
								onClick={toggleFullscreen}
							>
								<i class={`ph ${isFull() ? 'ph-arrows-in' : 'ph-arrows-out'}`} aria-hidden="true" />
							</button>
						</Show>
					</div>
				</div>
				<p class="sp-hint">Drag to rotate. Pinch or scroll to zoom. Tap a shelf to jump to its level.</p>
				<fieldset class="sp-check">
					<legend>Show in 3D</legend>
					<For each={[['none', 'Neither'], ['battens', 'Battens'], ['brackets', 'Brackets'], ['mix', 'Mix']] as [Fixings, string][]}>
						{([v, label]) => (
							<label>
								<input
									type="radio"
									name="sp-fixings"
									checked={fixings3d() === v}
									disabled={v === 'battens' && !fix().battensOnly}
									onChange={() => setFixings3d(v)}
								/>{' '}
								{label}
							</label>
						)}
					</For>
				</fieldset>
				<div class="sp-legend">
					<For each={TYPE_KEYS}>
						{(t) => (
							<span>
								<i class="sp-swatch" style={{ background: `var(${TYPES[t].color})` }} />
								{TYPES[t].name} · {fmt(plan().depths[t])}cm
							</span>
						)}
					</For>
					<Show when={fixings3d() !== 'none' && fixings3d() !== 'brackets'}>
						<span>
							<i class="sp-swatch" style={{ background: 'var(--color-accent)' }} />
							Battens
						</span>
					</Show>
					<Show when={fixings3d() !== 'none' && fixings3d() !== 'battens'}>
						<span>
							<i class="sp-swatch" style={{ background: 'var(--color-text)' }} />
							Brackets
						</span>
					</Show>
				</div>
				<div class="sp-stats">
					<div {...shows('walk')}>
						<small>Walkway</small>
						<b>{fmt(clear().walk)}cm</b>
						<span>Narrowest gap between the left and right shelves below {HEAD}cm.</span>
					</div>
					<div {...shows('depth')}>
						<small>Standing depth</small>
						<b>{fmt(clear().depth)}cm</b>
						<span>Space in front of the deepest back shelf below {HEAD}cm.</span>
					</div>
					<div {...shows('run')}>
						<small>Shelf run</small>
						<b>{fmt(totalRun() / 100)}m</b>
						<span>Every board end to end: the shelf wood to buy.</span>
					</div>
				</div>
			</div>

			<div class="sp-panels">
				<section class="sp-card">
					<h2>Saved plans</h2>
					<p class="sp-sub">Stored in this browser only. Your current plan is kept automatically. Share a saved plan to send it as a link.</p>
					<Show when={sharedName() !== null}>
						<p class="sp-shared" role="status">
							You're looking at a shared plan{sharedName() ? `, "${sharedName()}"` : ''}. Save it to keep a copy. Editing it replaces the
							plan this browser was keeping. <a href={location.pathname}>Back to your plan</a>
						</p>
					</Show>
					<form
						class="sp-save"
						onSubmit={(e) => {
							e.preventDefault()
							savePlan()
						}}
					>
						<label class="sp-num" for="sp-name" style={{ flex: '1 1 12rem' }}>
							<span class="sp-num-label">Name this plan</span>
							<input
								id="sp-name"
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
						<button class="zui-button zui-button-color-accent" type="submit">
							{pendingOverwrite() ? 'Replace saved plan' : 'Save plan'}
						</button>
					</form>
					<Show when={pendingOverwrite()}>
						<p class="sp-sub" role="status">
							"{pendingOverwrite()}" is already saved. Click again to replace it.
						</p>
					</Show>
					<Show when={nameError()}>
						<p class="sp-error" role="alert">
							{nameError()}
						</p>
					</Show>
					<Show when={savedNames().length} fallback={<p class="sp-empty">No saved plans yet. Name the current setup and save it to compare later.</p>}>
						<ul class="sp-saved">
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
										<button class="zui-button zui-button-variant-outline zui-button-size-sm" type="button" onClick={() => sharePlan(n)}>
											<i class="ph ph-link" aria-hidden="true" /> {copied() === n ? 'Link copied' : 'Share'}
										</button>
										{/* An icon until clicked; the confirm step spells it out. */}
										<Show
											when={pendingDelete() === n}
											fallback={
												<button
													class="zui-button zui-button-variant-ghost zui-button-size-sm zui-button-icon"
													type="button"
													aria-label={`Delete "${n}"`}
													onClick={() => deletePlan(n)}
												>
													<i class="ph ph-trash" aria-hidden="true" />
												</button>
											}
										>
											<button class="zui-button zui-button-color-destructive zui-button-size-sm" type="button" onClick={() => deletePlan(n)}>
												<i class="ph ph-trash" aria-hidden="true" /> Confirm delete
											</button>
										</Show>
									</li>
								)}
							</For>
						</ul>
					</Show>
				</section>

				<section class="sp-card">
					<h2>Room</h2>
					<p class="sp-sub">
						Wall depths run to the front of the opening. Returns are the short walls beside each door: width runs across, depth front to
						back. Side shelves stop at the back of a return, minus that side's setback. Set a return width to 0 if there isn't one.
					</p>
					<div class="sp-cells">
						<For each={ROOM_FIELDS}>
							{([k, label, [min, max]]) => (
								<NumField id={`sp-room-${k}`} label={label} value={plan().room[k]} min={min} max={max} onCommit={(v) => setRoom(k, v)} />
							)}
						</For>
					</div>
				</section>

				<section class="sp-card">
					<h2>Shelf sizes</h2>
					<p class="sp-sub">Depth front to back for each size. Changing one updates every shelf of that size.</p>
					<div class="sp-cells">
						<For each={TYPE_KEYS}>
							{(t: TypeKey) => (
								<NumField
									id={`sp-depth-${t}`}
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

				<section class="sp-card">
					<h2>Levels</h2>
					<p class="sp-sub">
						Every shelf on a level sits at the same height on all walls. Heights are to the top of the shelf. Gap is the clear height above
						it. Over-door shelves only go above {fmt(plan().room.doorMin)}cm.
					</p>
					<For each={levelIds()}>
						{(id) => {
							// Keep the last match: a removed level's row can read once more before the row goes.
							let last!: Level
							const l = () => (last = levels().find((x) => x.id === id) ?? last)
							const i = () => levels().findIndex((x) => x.id === id)
							const gap = () => gapAbove(plan(), i())
							return (
								<div class="sp-level" classList={{ 'is-selected': selId() === id }} data-level={id} onFocusIn={() => setSelId(id ?? null)}>
									<div class="sp-level-top">
										<span class="sp-level-num">{i() + 1}</span>
										<div class="sp-height">
											<button type="button" id={`sp-${id}-down`} aria-label="Down 5cm" onClick={() => editLevel(id, (x) => (x.y = clampY(plan().room, x.y - 5)))}>
												<i class="ph ph-minus" aria-hidden="true" />
											</button>
											<input
												type="number"
												step="0.5"
												id={`sp-${id}-y`}
												aria-label={`Level ${i() + 1} height in cm`}
												value={fmt(l().y)}
												onChange={(e) => {
													const v = Number.parseFloat(e.currentTarget.value)
													if (Number.isFinite(v)) editLevel(id, (x) => (x.y = clampY(plan().room, v)))
													else e.currentTarget.value = fmt(l().y)
												}}
											/>
											<button type="button" id={`sp-${id}-up`} aria-label="Up 5cm" onClick={() => editLevel(id, (x) => (x.y = clampY(plan().room, x.y + 5)))}>
												<i class="ph ph-plus" aria-hidden="true" />
											</button>
										</div>
										<span class="sp-gap" classList={{ 'is-tight': gap() < 20 }}>
											gap {fmt(gap())}cm
										</span>
										<button
											class="zui-button zui-button-variant-ghost zui-button-size-xs sp-remove"
											type="button"
											aria-label={`Remove level ${i() + 1}`}
											onClick={() => edit((p) => (p.levels = p.levels.filter((x) => x.id !== id)))}
										>
											<i class="ph ph-trash" aria-hidden="true" />
										</button>
									</div>
									<div class="sp-cells sp-cells-4">
										<For each={WALLS}>
											{([k, label]: [WallKey, string]) => {
												const disabled = () => k === 'D' && l().y < plan().room.doorMin
												return (
													<label class="sp-num" for={`sp-${id}-${k}`}>
														<span class="sp-num-label">{label}</span>
														<select
															id={`sp-${id}-${k}`}
															class="zui-select sp-select"
															disabled={disabled()}
															style={{ 'border-inline-start-color': l()[k] && !disabled() ? `var(${TYPES[l()[k] as TypeKey].color})` : undefined }}
															value={l()[k]}
															onChange={(e) => editLevel(id, (x) => (x[k] = e.currentTarget.value as TypeKey | ''))}
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
					<div class="sp-row">
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

				<section class="sp-card">
					<h2>Cut list</h2>
					<p class="sp-sub">
						Length × depth for each board, {fmt(plan().room.th * 10)}mm thick. Back shelves fit between the side shelves on the same level.
					</p>
					<div class="sp-tablewrap">
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
											<td class="sp-mono">{b.i + 1}</td>
											<td class="sp-mono">{fmt(b.y)}cm</td>
											<td>{b.wall}</td>
											<td>
												<i class="sp-swatch" style={{ background: `var(${TYPES[b.t].color})` }} />
												{TYPES[b.t].name}
											</td>
											<td class="sp-mono">{fmt(b.len)}cm</td>
											<td class="sp-mono">{fmt(b.d)}cm</td>
										</tr>
									)}
								</For>
							</tbody>
							<tfoot>
								<tr>
									<td colspan="4">{allBoards().length} boards</td>
									<td class="sp-mono" colspan="2">
										{fmt(totalRun() / 100)}m total
									</td>
								</tr>
							</tfoot>
						</table>
					</div>
					<h3>By board width</h3>
					<div class="sp-tablewrap">
						<table>
							<thead>
								<tr>
									<th>Width</th>
									<th>Boards</th>
									<th>Total length</th>
									<th>{fmt(STOCK / 100)}m lengths</th>
								</tr>
							</thead>
							<tbody>
								<For each={totals()}>
									{(w) => (
										<tr>
											<td class="sp-mono">{fmt(w.d)}cm</td>
											<td class="sp-mono">{w.count}</td>
											<td class="sp-mono">{fmt(w.run / 100)}m</td>
											<td class="sp-mono">{w.stock}</td>
										</tr>
									)}
								</For>
							</tbody>
						</table>
					</div>
					<div class="sp-row">
						<button class="zui-button zui-button-color-accent" type="button" onClick={downloadPdf}>
							<i class="ph ph-file-pdf" aria-hidden="true" /> Save as PDF
						</button>
						<button class="zui-button zui-button-variant-outline" type="button" onClick={copyCutList}>
							<i class="ph ph-copy" aria-hidden="true" /> Copy cut list
						</button>
					</div>
					<p class="sp-toast" role="status">
						{toast()}
					</p>
					<ul class="sp-notes">
						<For each={notes(plan().room)}>{(n) => <li>{n}</li>}</For>
					</ul>
				</section>

				<section class="sp-card">
					<h2>Fixings</h2>
					<p class="sp-sub">
						Battens are strips of timber, about 25 × 38mm, screwed to the wall under every shelf edge that meets a wall. A shelf needs a
						wall on at least two edges to sit on them. Shelf brackets (L-brackets) go under each shelf. Use one, or mix them.
					</p>
					<div class="sp-stats sp-stats-2">
						<div>
							<small>Brackets only</small>
							<b>{fix().brackets}</b>
							<span>{bracketRule}</span>
						</div>
						<div>
							<small>Battens only</small>
							<Show
								when={fix().battensOnly}
								fallback={<span>Not possible here: some shelves have no wall at their ends, as in a U of shelves. Use brackets or a mix.</span>}
							>
								<b>{fmt(fix().battenRun / 100)}m</b>
								<span>{battenText()}</span>
							</Show>
						</div>
						<Show when={!fix().battensOnly && fix().battens.length > 0}>
							<div>
								<small>Mix</small>
								<b>{fmt(fix().battenRun / 100)}m + {fix().mixBrackets}</b>
								<span>
									Battens on the shelves that have a wall on two edges, brackets for the rest ({fix().mixBrackets}). {battenText()}
								</span>
							</div>
						</Show>
					</div>
				</section>
			</div>
		</div>
	)
}
