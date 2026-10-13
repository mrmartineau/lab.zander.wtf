/** A4 PDF of the plan: doorway view, room, depths, levels, cut list and notes. */
import {
	type Plan,
	ROOM_FIELDS,
	BRACKET_END,
	BRACKET_GAP,
	STOCK,
	TYPES,
	TYPE_KEYS,
	type TypeKey,
	boards,
	encodeShare,
	fixings,
	fmt,
	gapAbove,
	groupLengths,
	sizeGroups,
	widthTotals,
	joinNote,
	notes,
	sortLevels,
} from './model'

export async function savePdf(plan: Plan, name: string, image?: { url: string; ratio: number }) {
	const { jsPDF } = await import('jspdf')
	const doc = new jsPDF({ unit: 'mm', format: 'a4' })
	const M = 14
	const W = 210 - 2 * M
	let y = M
	/** Starts a new page when h won't fit. Returns true when it did. */
	const need = (h: number) => {
		if (y + h <= 285) return false
		doc.addPage()
		y = M
		return true
	}
	const typeName = (t: TypeKey | '') => (t ? `${TYPES[t].name} ${fmt(plan.depths[t])}` : '–')

	doc.setFont('helvetica', 'bold')
	doc.setFontSize(18)
	doc.text('Shelf plan', M, y + 5)
	y += 10
	doc.setFont('helvetica', 'normal')
	doc.setFontSize(10)
	doc.setTextColor(90)
	const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
	doc.text(name ? `${name}  ·  ${date}` : date, M, y)
	y += 5
	// The link carries the whole plan, so opening it in the planner brings this exact plan back.
	doc.setTextColor(30, 90, 200)
	doc.textWithLink('Open this plan in the shelf planner: lab.zander.wtf/shelf-planner', M, y, {
		url: `https://lab.zander.wtf/shelf-planner/p/${encodeShare(name, plan)}`,
	})
	doc.setTextColor(0)
	y += 6

	if (image) {
		const ih = Math.min(110, W * image.ratio)
		const iw = ih / image.ratio
		doc.addImage(image.url, 'PNG', M + (W - iw) / 2, y, iw, ih)
		y += ih + 4
	}

	const head = (t: string) => {
		need(12)
		doc.setFont('helvetica', 'bold')
		doc.setFontSize(12)
		doc.text(t, M, y + 4)
		y += 8
		doc.setFontSize(9.5)
	}
	const table = (cols: [string, number][], rows: (string | number)[][]) => {
		const header = cols.map((c) => c[0])
		const row = (r: (string | number)[], bold: boolean) => {
			// A table that runs onto a new page repeats its header there.
			if (need(6) && !bold) row(header, true)
			doc.setFont('helvetica', bold ? 'bold' : 'normal')
			let x = M
			r.forEach((c, i) => {
				doc.text(String(c), x, y + 4)
				x += cols[i][1]
			})
			y += 5.5
			doc.setDrawColor(215)
			doc.line(M, y, M + W, y)
			y += 0.5
		}
		row(header, true)
		for (const r of rows) row(r, false)
		y += 3
	}

	head('Room (cm)')
	const pairs = ROOM_FIELDS.map(([k, label]) => [label, fmt(plan.room[k])])
	const roomRows: string[][] = []
	for (let i = 0; i < pairs.length; i += 2) roomRows.push([...pairs[i], ...(pairs[i + 1] ?? ['', ''])])
	table(
		[
			['Measurement', 62],
			['cm', 29],
			['Measurement', 62],
			['cm', 29],
		],
		roomRows,
	)

	head('Shelf sizes')
	table(
		[
			['Size', 62],
			['Depth (cm)', 30],
		],
		TYPE_KEYS.map((t) => [TYPES[t].name, fmt(plan.depths[t])]),
	)

	head('Levels (height to top of shelf)')
	const lv = sortLevels(plan.levels)
	table(
		[
			['Level', 14],
			['Height', 20],
			['Gap above', 22],
			['Left', 32],
			['Back', 32],
			['Right', 32],
			['Over door', 30],
		],
		lv
			.map((l, i) => [
				i + 1,
				fmt(l.y),
				fmt(gapAbove(plan, i)),
				typeName(l.L),
				typeName(l.B),
				typeName(l.R),
				l.y >= plan.room.doorMin ? typeName(l.D) : '–',
			])
			.reverse(),
	)

	const b = boards(plan)
	head(`Cut list (${fmt(plan.room.th * 10)}mm boards)`)
	table(
		[
			['Level', 14],
			['Height', 20],
			['Wall', 28],
			['Size', 34],
			['Length (cm)', 30],
			['Depth (cm)', 30],
		],
		b.map((s) => [s.i + 1, fmt(s.y), s.wall, TYPES[s.t].name, fmt(s.len), fmt(s.d)]),
	)
	need(8)
	doc.setFont('helvetica', 'bold')
	doc.text(`${b.length} boards, ${fmt(b.reduce((a, s) => a + s.len, 0) / 100)}m total run`, M, y + 2)
	y += 8

	const sizes = sizeGroups(b)
	if (sizes.some((s) => s.n > 1)) {
		head('Cut sizes (depth x length)')
		table(
			[
				['Boards', 30],
				['Depth (cm)', 40],
				['Length (cm)', 40],
			],
			sizes.map((s) => [s.n, fmt(s.d), fmt(s.len)]),
		)
	}

	head('By board width')
	table(
		[
			['Width (cm)', 40],
			['Boards', 30],
			['Total length (m)', 50],
			[`${fmt(STOCK / 100)}m lengths`, 40],
		],
		widthTotals(b).map((w) => [fmt(w.d), w.count, fmt(w.run / 100), w.stock]),
	)

	const f = fixings(plan)
	head('Fixings (use one, or mix them)')
	doc.setFont('helvetica', 'normal')
	const cut = `${f.stock} x ${fmt(STOCK / 100)}m lengths. Cut ${groupLengths(f.battens) || 'nothing'}.${joinNote(f.battens)}`
	for (const t of [
		`Brackets only (L-brackets): ${f.brackets}. 2 per shelf up to ${fmt(2 * BRACKET_END + BRACKET_GAP)}cm long, 3 or more over that, at most ${BRACKET_GAP}cm apart. Add screws and wall plugs for each.`,
		f.battensOnly
			? `Battens only: ${fmt(f.battenRun / 100)}m, ${cut} One under every shelf edge that meets a wall.`
			: 'Battens only: not possible here. Some shelves have no wall at their ends, as in a U of shelves.',
		...(f.battensOnly || !f.battens.length
			? []
			: [`Mix: battens on the shelves with a wall on two edges (${fmt(f.battenRun / 100)}m, ${cut}), and ${f.mixBrackets} brackets for the rest.`]),
	]) {
		const lines = doc.splitTextToSize(t, W)
		need(lines.length * 4.5)
		doc.text(lines, M, y + 3)
		y += lines.length * 4.5 + 1
	}
	y += 3

	head('Notes')
	doc.setFont('helvetica', 'normal')
	for (const t of notes(plan.room)) {
		const lines = doc.splitTextToSize(`• ${t}`, W)
		need(lines.length * 4.5)
		doc.text(lines, M, y + 3)
		y += lines.length * 4.5 + 1
	}

	const slug = (name || 'plan').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'plan'
	doc.save(`shelves-${slug}.pdf`)
}
