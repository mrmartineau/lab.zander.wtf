/** A4 PDF of the plan: doorway view, room, depths, levels, cut list and notes. */
import { type Plan, ROOM_FIELDS, TYPES, TYPE_KEYS, type TypeKey, boards, fmt, gapAbove, notes, sortLevels } from './model'

export async function savePdf(plan: Plan, name: string, image?: { url: string; ratio: number }) {
	const { jsPDF } = await import('jspdf')
	const doc = new jsPDF({ unit: 'mm', format: 'a4' })
	const M = 14
	const W = 210 - 2 * M
	let y = M
	const need = (h: number) => {
		if (y + h > 285) {
			doc.addPage()
			y = M
		}
	}
	const typeName = (t: TypeKey | '') => (t ? `${TYPES[t].name} ${fmt(plan.depths[t])}` : '–')

	doc.setFont('helvetica', 'bold')
	doc.setFontSize(18)
	doc.text('Pantry shelf plan', M, y + 5)
	y += 10
	doc.setFont('helvetica', 'normal')
	doc.setFontSize(10)
	doc.setTextColor(90)
	const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
	doc.text(name ? `${name}  ·  ${date}` : date, M, y)
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
		const row = (r: (string | number)[], bold: boolean) => {
			need(6)
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
		row(
			cols.map((c) => c[0]),
			true,
		)
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

	head('Shelf depths')
	table(
		[
			['Type', 62],
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
			['Use', 34],
			['Length (cm)', 30],
			['Depth (cm)', 30],
		],
		b.map((s) => [s.i + 1, fmt(s.y), s.wall, TYPES[s.t].name, fmt(s.len), fmt(s.d)]),
	)
	need(8)
	doc.setFont('helvetica', 'bold')
	doc.text(`${b.length} boards, ${fmt(b.reduce((a, s) => a + s.len, 0) / 100)}m total run`, M, y + 2)
	y += 8

	head('Notes')
	doc.setFont('helvetica', 'normal')
	for (const t of notes(plan.room)) {
		const lines = doc.splitTextToSize(`• ${t}`, W)
		need(lines.length * 4.5)
		doc.text(lines, M, y + 3)
		y += lines.length * 4.5 + 1
	}

	const slug = (name || 'plan').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'plan'
	doc.save(`pantry-shelves-${slug}.pdf`)
}
