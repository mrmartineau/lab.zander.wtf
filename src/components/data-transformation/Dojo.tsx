/**
 * Data Transformation Dojo — an interactive trainer for reshaping data
 * in JavaScript. Pick a challenge, write a `solve` function, run it against
 * hidden tests, and get progressive hints when stuck. Progress is kept in
 * localStorage.
 */

import Editor, { type OnMount } from '@monaco-editor/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type Difficulty, challenges } from './challenges'
import { type RunResult, formatValue, runChallenge } from './evaluator'
import { highlightJs } from './highlight'

const STORAGE_KEY = 'dtd-progress-v1'

interface Progress {
	/** Editor contents per challenge id. */
	code: Record<string, string>
	/** Ids of solved challenges. */
	completed: string[]
	/** How many hints have been revealed, per challenge id. */
	hints: Record<string, number>
}

const EMPTY_PROGRESS: Progress = { code: {}, completed: [], hints: {} }

function loadProgress(): Progress {
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) return EMPTY_PROGRESS
		const parsed = JSON.parse(raw) as Partial<Progress>
		return {
			code: parsed.code ?? {},
			completed: parsed.completed ?? [],
			hints: parsed.hints ?? {},
		}
	} catch {
		return EMPTY_PROGRESS
	}
}

const DIFFICULTY_BADGE: Record<Difficulty, string> = {
	easy: 'zui-badge-color-emerald',
	medium: 'zui-badge-color-amber',
	hard: 'zui-badge-color-rose',
}

/** Render text with `backtick` spans turned into inline <code>. */
function RichText({ text }: { text: string }) {
	return (
		<>
			{text.split('`').map((part, i) =>
				i % 2 === 1 ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: static split
					<code key={i} className="dtd-code">
						{part}
					</code>
				) : (
					// biome-ignore lint/suspicious/noArrayIndexKey: static split
					<span key={i}>{part}</span>
				),
			)}
		</>
	)
}

export default function Dojo() {
	const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS)
	const [hydrated, setHydrated] = useState(false)
	const [selectedId, setSelectedId] = useState(challenges[0].id)
	const [results, setResults] = useState<Record<string, RunResult>>({})
	// Monaco's built-in light/dark theme, tracked to the OS colour scheme.
	const [monacoTheme, setMonacoTheme] = useState<'vs' | 'vs-dark'>('vs-dark')

	// Hydrate from localStorage after mount so server and client first
	// renders match.
	useEffect(() => {
		setProgress(loadProgress())
		setHydrated(true)
	}, [])

	useEffect(() => {
		if (!hydrated) return
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
		} catch {
			// storage full or unavailable — progress just won't persist
		}
	}, [progress, hydrated])

	const challenge = useMemo(
		() => challenges.find((c) => c.id === selectedId) ?? challenges[0],
		[selectedId],
	)
	const challengeIndex = challenges.indexOf(challenge)
	const code = progress.code[challenge.id] ?? challenge.starter
	const revealedHints = progress.hints[challenge.id] ?? 0
	const result = results[challenge.id]
	const isSolved = progress.completed.includes(challenge.id)
	const allHintsShown = revealedHints >= challenge.hints.length

	// Follow the OS light/dark preference for the editor theme.
	useEffect(() => {
		const mq = window.matchMedia('(prefers-color-scheme: dark)')
		const apply = () => setMonacoTheme(mq.matches ? 'vs-dark' : 'vs')
		apply()
		mq.addEventListener('change', apply)
		return () => mq.removeEventListener('change', apply)
	}, [])

	const setCode = useCallback(
		(value: string) => {
			setProgress((p) => ({
				...p,
				code: { ...p.code, [challenge.id]: value },
			}))
		},
		[challenge.id],
	)

	const handleRun = useCallback(() => {
		const current = challenge
		const source = progress.code[current.id] ?? current.starter
		const runResult = runChallenge(current, source)
		setResults((r) => ({ ...r, [current.id]: runResult }))
		if (runResult.ok) {
			setProgress((p) =>
				p.completed.includes(current.id)
					? p
					: { ...p, completed: [...p.completed, current.id] },
			)
		}
	}, [challenge, progress.code])

	const handleReset = useCallback(() => {
		setCode(challenge.starter)
		setResults((r) => {
			const next = { ...r }
			delete next[challenge.id]
			return next
		})
	}, [challenge, setCode])

	const handleHint = useCallback(() => {
		setProgress((p) => ({
			...p,
			hints: {
				...p.hints,
				[challenge.id]: Math.min(
					(p.hints[challenge.id] ?? 0) + 1,
					challenge.hints.length,
				),
			},
		}))
	}, [challenge])

	const handleRevealSolution = useCallback(() => {
		if (
			window.confirm(
				'Replace your code with the reference solution? Your current attempt will be lost.',
			)
		) {
			setCode(challenge.solution)
		}
	}, [challenge, setCode])

	// Keep a live ref to handleRun so the Monaco command — registered once on
	// mount — always invokes the current closure.
	const runRef = useRef(handleRun)
	useEffect(() => {
		runRef.current = handleRun
	}, [handleRun])

	const handleEditorMount = useCallback<OnMount>((editor, monaco) => {
		editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
			runRef.current()
		})
	}, [])

	const solvedCount = progress.completed.length
	const progressPct = Math.round((solvedCount / challenges.length) * 100)
	const passCount = result?.results.filter((r) => r.passed).length ?? 0

	return (
		<div className="dtd">
			<aside className="dtd-sidebar">
				<div className="dtd-brand">
					<h1 className="dtd-brand-title">Data Transformation Dojo</h1>
					<p className="dtd-brand-sub">
						Reshape data the way real APIs make you. Write a{' '}
						<code className="dtd-code">solve</code> function, run the tests.
					</p>
					<div className="dtd-progress">
						<div className="dtd-progress-row">
							<span>Progress</span>
							<span>
								{solvedCount} / {challenges.length}
							</span>
						</div>
						<div className="dtd-progress-track">
							<div
								className="dtd-progress-fill"
								style={{ width: `${progressPct}%` }}
							/>
						</div>
					</div>
				</div>
				<ol className="dtd-list">
					{challenges.map((c, i) => {
						const done = progress.completed.includes(c.id)
						const active = c.id === selectedId
						return (
							<li key={c.id}>
								<button
									type="button"
									className={`dtd-list-btn${active ? ' is-active' : ''}${
										done ? ' is-done' : ''
									}`}
									onClick={() => setSelectedId(c.id)}
								>
									<span className="dtd-list-num">
										{done ? <i className="ph ph-check" /> : i + 1}
									</span>
									<span className="dtd-list-text">
										<span className="dtd-list-title">{c.title}</span>
										<span className="dtd-list-method">{c.method}</span>
									</span>
									<span
										className={`dtd-dot dtd-dot-${c.difficulty}`}
										title={c.difficulty}
									/>
								</button>
							</li>
						)
					})}
				</ol>
				<a className="dtd-back zui-link" href="/">
					← All lab items
				</a>
			</aside>

			<main className="dtd-main">
				<div className="dtd-scroll">
					<header className="dtd-head">
						<div className="dtd-head-top">
							<span className="dtd-step">
								Challenge {challengeIndex + 1} of {challenges.length}
							</span>
							{isSolved && (
								<span className="zui-badge zui-badge-variant-fill zui-badge-color-emerald">
									<i className="ph ph-check" /> Solved
								</span>
							)}
						</div>
						<h2 className="dtd-title">{challenge.title}</h2>
						<div className="dtd-tags">
							<span className="zui-badge zui-badge-color-blue">
								{challenge.method}
							</span>
							<span
								className={`zui-badge ${DIFFICULTY_BADGE[challenge.difficulty]}`}
							>
								{challenge.difficulty}
							</span>
						</div>
						<p className="dtd-brief">
							<RichText text={challenge.brief} />
						</p>
					</header>

					<section className="dtd-task">
						<h3 className="dtd-h3">
							<i className="ph ph-target" /> Your task
						</h3>
						<p>
							<RichText text={challenge.task} />
						</p>
					</section>

					<div className="dtd-workbench">
						<section className="dtd-editor-wrap">
							<div className="dtd-panel-bar">
								<span className="dtd-panel-name">
									<i className="ph ph-code" /> solve.js
								</span>
								<span className="dtd-editor-kbd">
									<kbd>⌘</kbd>
									<kbd>↵</kbd> run
								</span>
							</div>
							<div className="dtd-editor-area">
								<Editor
									language="javascript"
									theme={monacoTheme}
									value={code}
									onChange={(value) => setCode(value ?? '')}
									onMount={handleEditorMount}
									loading={
										<span className="dtd-editor-loading">
											Loading editor…
										</span>
									}
									options={{
										minimap: { enabled: false },
										fontSize: 13,
										lineNumbers: 'on',
										scrollBeyondLastLine: false,
										tabSize: 2,
										insertSpaces: true,
										automaticLayout: true,
										padding: { top: 12, bottom: 12 },
										renderLineHighlight: 'line',
										smoothScrolling: true,
										wordWrap: 'on',
										folding: false,
										overviewRulerLanes: 0,
										scrollbar: {
											verticalScrollbarSize: 10,
											horizontalScrollbarSize: 10,
										},
									}}
								/>
							</div>
						</section>

						<aside className="dtd-data">
							<div className="dtd-panel-bar">
								<span className="dtd-panel-name">
									<i className="ph ph-database" /> Sample input
								</span>
							</div>
							<div className="dtd-data-body">
								{challenge.tests.map((test) => (
									<div className="dtd-data-case" key={test.name}>
										<span className="dtd-data-name">{test.name}</span>
										{test.args.map((arg, i) => (
											<pre
												// biome-ignore lint/suspicious/noArrayIndexKey: fixed args
												key={i}
												className="dtd-pre"
												// biome-ignore lint/security/noDangerouslySetInnerHtml: highlighter escapes its input
												dangerouslySetInnerHTML={{
													__html: highlightJs(formatValue(arg)),
												}}
											/>
										))}
									</div>
								))}
							</div>
						</aside>
					</div>

					<div className="dtd-actions">
						<button
							type="button"
							className="zui-button"
							onClick={handleRun}
						>
							<i className="ph ph-play" /> Run tests
						</button>
						<button
							type="button"
							className="zui-button zui-button-variant-outline"
							onClick={handleReset}
						>
							<i className="ph ph-arrow-counter-clockwise" /> Reset
						</button>
						<button
							type="button"
							className="zui-button zui-button-variant-ghost"
							onClick={handleHint}
							disabled={allHintsShown}
						>
							<i className="ph ph-lightbulb" />{' '}
							{revealedHints === 0
								? 'Show a hint'
								: allHintsShown
									? 'All hints shown'
									: `Next hint (${revealedHints}/${challenge.hints.length})`}
						</button>
					</div>

					{revealedHints > 0 && (
						<section className="dtd-hints">
							{challenge.hints.slice(0, revealedHints).map((hint, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: ordered hints
								<div className="dtd-hint" key={i}>
									<span className="dtd-hint-badge">Hint {i + 1}</span>
									<p>
										<RichText text={hint} />
									</p>
								</div>
							))}
							{allHintsShown && (
								<button
									type="button"
									className="dtd-solution-btn"
									onClick={handleRevealSolution}
								>
									<i className="ph ph-eye" /> Still stuck? Reveal the solution
								</button>
							)}
						</section>
					)}

					{result && (
						<section className="dtd-results">
							{result.compileError ? (
								<div className="dtd-result-banner is-fail">
									<i className="ph ph-warning-circle" />
									<div>
										<strong>Your code could not run</strong>
										<pre className="dtd-pre">{result.compileError}</pre>
									</div>
								</div>
							) : (
								<>
									<div
										className={`dtd-result-banner ${
											result.ok ? 'is-pass' : 'is-fail'
										}`}
									>
										<i
											className={
												result.ok
													? 'ph ph-confetti'
													: 'ph ph-x-circle'
											}
										/>
										<div>
											<strong>
												{result.ok
													? 'All tests passed — challenge solved!'
													: `${passCount} of ${result.results.length} tests passed`}
											</strong>
											{!result.ok && (
												<span className="dtd-result-sub">
													Check the failing cases below, or grab a hint.
												</span>
											)}
										</div>
									</div>
									<ul className="dtd-test-list">
										{result.results.map((r) => (
											<li
												key={r.name}
												className={`dtd-test ${
													r.passed ? 'is-pass' : 'is-fail'
												}`}
											>
												<div className="dtd-test-head">
													<i
														className={
															r.passed
																? 'ph ph-check-circle'
																: 'ph ph-x-circle'
														}
													/>
													<span className="dtd-test-name">{r.name}</span>
												</div>
												{!r.passed && (
													<div className="dtd-diff">
														<div className="dtd-diff-col">
															<span className="dtd-diff-label">
																Expected
															</span>
															<pre className="dtd-pre">{r.expected}</pre>
														</div>
														<div className="dtd-diff-col">
															<span className="dtd-diff-label">
																{r.errored ? 'Threw' : 'Your output'}
															</span>
															<pre className="dtd-pre">{r.actual}</pre>
														</div>
													</div>
												)}
											</li>
										))}
									</ul>
								</>
							)}
						</section>
					)}
				</div>
			</main>
		</div>
	)
}
