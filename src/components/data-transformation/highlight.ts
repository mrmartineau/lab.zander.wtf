/**
 * Tiny dependency-free JavaScript syntax highlighter.
 *
 * Turns a code string into HTML with `dtd-tok-*` spans. Good enough for the
 * short snippets in the dojo — not a full parser. Used both for the live
 * editor overlay and the sample-data panels.
 */

const KEYWORDS = new Set([
	'function', 'return', 'const', 'let', 'var', 'for', 'of', 'in', 'if',
	'else', 'new', 'true', 'false', 'null', 'undefined', 'continue', 'break',
	'typeof', 'instanceof', 'this', 'class', 'do', 'while', 'switch', 'case',
	'default', 'await', 'async', 'yield', 'delete', 'void',
])

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
}

// Order matters: comments and strings are matched before everything else.
const TOKEN_RE =
	/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(`(?:\\[\s\S]|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\d[\w.]*)|([A-Za-z_$][\w$]*)|(\s+)|([\s\S])/g

type TokenType = 'com' | 'str' | 'num' | 'ident' | 'ws' | 'pun'
interface Token {
	type: TokenType
	text: string
}

export function highlightJs(code: string): string {
	const tokens: Token[] = []
	TOKEN_RE.lastIndex = 0
	let m: RegExpExecArray | null
	// biome-ignore lint/suspicious/noAssignInExpressions: regex iteration
	while ((m = TOKEN_RE.exec(code)) !== null) {
		if (m[1] !== undefined) tokens.push({ type: 'com', text: m[1] })
		else if (m[2] !== undefined) tokens.push({ type: 'str', text: m[2] })
		else if (m[3] !== undefined) tokens.push({ type: 'num', text: m[3] })
		else if (m[4] !== undefined) tokens.push({ type: 'ident', text: m[4] })
		else if (m[5] !== undefined) tokens.push({ type: 'ws', text: m[5] })
		else tokens.push({ type: 'pun', text: m[6] })
	}

	let html = ''
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i]
		const escaped = escapeHtml(token.text)
		if (token.type === 'ws') {
			html += escaped
			continue
		}
		if (token.type !== 'ident') {
			html += `<span class="dtd-tok-${token.type}">${escaped}</span>`
			continue
		}
		// Identifier — classify by keyword, or by the tokens around it.
		let cls = 'dtd-tok-var'
		if (KEYWORDS.has(token.text)) {
			cls = 'dtd-tok-kw'
		} else {
			let n = i + 1
			while (n < tokens.length && tokens[n].type === 'ws') n++
			let p = i - 1
			while (p >= 0 && tokens[p].type === 'ws') p--
			const next = tokens[n]
			const prev = tokens[p]
			if (next?.type === 'pun' && next.text === '(') cls = 'dtd-tok-fn'
			else if (next?.type === 'pun' && next.text === ':') cls = 'dtd-tok-prop'
			else if (prev?.type === 'pun' && prev.text === '.') cls = 'dtd-tok-prop'
		}
		html += `<span class="${cls}">${escaped}</span>`
	}
	// A trailing newline needs a filler char or the last line collapses.
	if (code.endsWith('\n')) html += ' '
	return html
}
