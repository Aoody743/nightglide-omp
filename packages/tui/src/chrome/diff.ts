import { diffWords } from "@oh-my-pi/pi-natives";
import { DEFAULT_TAB_WIDTH, sanitizeText } from "@oh-my-pi/pi-utils";
import type { TspDiffHunk, TspProps } from "@oh-my-pi/pi-wire";
import { theme as activeTheme, getLanguageFromPath, highlightCode, type Theme, type ThemeColor } from "../theme/index";
import { type CodeFrameMarker, formatCodeFrameLine, replaceTabs } from "../render/render-utils";
import { padding, truncateToWidth, visibleWidth } from "../utils";
import { node } from "../native/describe";
import type { NativeNode } from "../native/node";
/** SGR dim on / normal intensity — additive, preserves fg/bg colors. */
const DIM = "\x1b[2m";
const DIM_OFF = "\x1b[22m";
// Hoisted: a regex literal allocates a new RegExp object on every evaluation.
const LEADING_INDENT = /^([ \t]+)/;
const LEADING_WHITESPACE = /^(\s*)/;
const CANONICAL_DIFF_LINE = /^([+-\s])(\s*\d+)\|(.*)$/;
const LEGACY_DIFF_LINE = /^([+-\s])(?:(\s*\d+)\s)?(.*)$/;

/**
 * Visualize leading whitespace (indentation) with dim glyphs.
 * Tabs become ` → ` and spaces become `·`. Only affects whitespace
 * before the first non-whitespace character; remaining tabs in code
 * content are replaced with spaces (like replaceTabs).
 */
function visualizeIndent(text: string): string {
	const match = text.match(LEADING_INDENT);
	if (!match) return replaceTabs(text);
	const indent = match[1];
	const rest = text.slice(indent.length);
	const tabWidth = DEFAULT_TAB_WIDTH;
	const leftPadding = Math.floor(tabWidth / 2);
	const rightPadding = Math.max(0, tabWidth - leftPadding - 1);
	const tabMarker = `${DIM}${" ".repeat(leftPadding)}→${" ".repeat(rightPadding)}${DIM_OFF}`;
	let visible = "";
	for (const ch of indent) {
		if (ch === "\t") {
			visible += tabMarker;
		} else {
			visible += `${DIM}·${DIM_OFF}`;
		}
	}
	return `${visible}${replaceTabs(rest)}`;
}

/**
 * Parse diff line to extract prefix, line number, and content.
 * Supported formats: "+123|content" (canonical) and "+123 content" (legacy).
 */
function parseDiffLine(line: string): { prefix: CodeFrameMarker; lineNum: string; content: string } | null {
	const canonical = line.match(CANONICAL_DIFF_LINE);
	if (canonical) {
		return { prefix: canonical[1] as CodeFrameMarker, lineNum: canonical[2] ?? "", content: canonical[3] ?? "" };
	}
	const legacy = line.match(LEGACY_DIFF_LINE);
	if (!legacy) return null;
	return { prefix: legacy[1] as CodeFrameMarker, lineNum: legacy[2] ?? "", content: legacy[3] ?? "" };
}

/**
 * Compute word-level diff and render changed parts with a quieter foreground
 * emphasis (no inverse video, no background). Uses diffWords which groups
 * whitespace with adjacent words for cleaner highlighting. Strips leading
 * whitespace from the emphasis to avoid highlighting indentation.
 *
 * The emphasis reads `toolDiffWordAdded` / `toolDiffWordRemoved`, two optional
 * theme slots; a theme that omits them (`hasColor()` unset) falls back to the
 * line-level `toolDiffAdded` / `toolDiffRemoved` foregrounds, so unchanged
 * themes keep their palette while every theme drops the old full-row inverse.
 */
function renderIntraLineDiff(
	oldContent: string,
	newContent: string,
	renderTheme: Theme,
): { removedLine: string; addedLine: string } {
	const wordRemovedColor = renderTheme.hasColor("toolDiffWordRemoved") ? "toolDiffWordRemoved" : "toolDiffRemoved";
	const wordAddedColor = renderTheme.hasColor("toolDiffWordAdded") ? "toolDiffWordAdded" : "toolDiffAdded";
	const wordDiff = diffWords(oldContent, newContent);

	let removedLine = "";
	let addedLine = "";
	let isFirstRemoved = true;
	let isFirstAdded = true;

	for (const part of wordDiff) {
		if (part.removed) {
			let value = part.value;
			// Strip leading whitespace from the first removed part
			if (isFirstRemoved) {
				const leadingWs = value.match(LEADING_WHITESPACE)?.[1] || "";
				value = value.slice(leadingWs.length);
				removedLine += leadingWs;
				isFirstRemoved = false;
			}
			if (value) {
				removedLine += renderTheme.fg(wordRemovedColor, value);
			}
		} else if (part.added) {
			let value = part.value;
			// Strip leading whitespace from the first added part
			if (isFirstAdded) {
				const leadingWs = value.match(LEADING_WHITESPACE)?.[1] || "";
				value = value.slice(leadingWs.length);
				addedLine += leadingWs;
				isFirstAdded = false;
			}
			if (value) {
				addedLine += renderTheme.fg(wordAddedColor, value);
			}
		} else {
			removedLine += part.value;
			addedLine += part.value;
		}
	}

	return { removedLine, addedLine };
}

/**
 * Native `diff` node for omp's compact diff text (`+12|added`, `-12|removed`,
 * ` 12|context`, blank or `…` rows between regions). Each run of consecutive
 * lines becomes one hunk; a blank or `…` row or a jump in line numbers (distant
 * edits follow each other directly) starts the next. The terminal draws
 * gutters, word emphasis, highlighting and the unchanged-line count between
 * hunks. Removed rows carry old line numbers, added rows new ones and context
 * rows old ones, so the other side follows from the running line offset.
 * Runs without an added or removed row are dropped: they are the far
 * enclosing-block lines (a section heading, a function's closing brace) the
 * model reads as anchors, which as hunks of their own only bury the change.
 * Tern picks the grammar from `path`.
 */
export function nativeDiff(diffText: string, props: TspProps<"diff"> = {}): NativeNode {
	const hunks: TspDiffHunk[] = [];
	let lines: string[] = [];
	let changed = false;
	let oldStart = 1;
	let newStart = 1;
	// The old and new lines the open run continues with.
	let nextOld = 1;
	let nextNew = 1;
	const close = (): void => {
		if (changed) hunks.push({ oldStart, newStart, lines });
		lines = [];
		changed = false;
	};
	for (const raw of sanitizeText(diffText).split("\n")) {
		const parsed = parseDiffLine(raw);
		const trimmed = raw.trim();
		if (!parsed || (parsed.prefix === " " && (parsed.content === "..." || parsed.content === "…"))) {
			if (trimmed.length === 0 || trimmed === "..." || trimmed === "…") close();
			continue;
		}
		const number = Number.parseInt(parsed.lineNum.trim(), 10);
		const added = parsed.prefix === "+";
		if (Number.isFinite(number) && number !== (added ? nextNew : nextOld)) {
			close();
			// The lines skipped are unchanged: both sides move by as many.
			const skipped = number - (added ? nextNew : nextOld);
			nextOld += skipped;
			nextNew += skipped;
		}
		if (lines.length === 0) {
			oldStart = nextOld;
			newStart = nextNew;
		}
		if (parsed.prefix !== "+") nextOld++;
		if (parsed.prefix !== "-") nextNew++;
		changed ||= parsed.prefix !== " ";
		lines.push(`${parsed.prefix}${parsed.content}`);
	}
	close();
	return node("diff", { ...props, hunks });
}

/**
 * Usable content width (the framed card's inner width, in terminal cells) at
 * which {@link renderDiff} switches from the unified gutter layout to the
 * two-column side-by-side layout. Below this the single-column view is used
 * unchanged, so 80/100-column behavior is identical to the pre-side-by-side
 * renderer.
 */
export const SIDE_BY_SIDE_MIN_WIDTH = 120;

/**
 * Column width below which word-level intra-line emphasis is dropped in the
 * side-by-side layout: `diffWords` fragments a short cell into many tiny
 * colored spans that read as confetti rather than emphasis, so narrow columns
 * degrade to the whole-line `toolDiffRemoved` / `toolDiffAdded` foregrounds.
 * Sixteen cells still fit a handful of tokens, which is the smallest span
 * where per-word emphasis stays legible.
 */
const SIDE_BY_SIDE_MIN_WORD_DIFF_COLUMN = 16;

export interface RenderDiffOptions {
	/** File path used to resolve indentation (.editorconfig + defaults) */
	filePath?: string;
	/** Theme used for diff colors and syntax highlighting; defaults to the active TUI theme. */
	theme?: Theme;
	/**
	 * Usable content width in terminal cells (the framed card's inner width).
	 * When `width >= SIDE_BY_SIDE_MIN_WIDTH` the diff renders side-by-side
	 * (old on the left, new on the right, one-cell divider); otherwise the
	 * unified single-gutter layout is used. Rows never exceed this width:
	 * oversized cell content is truncated in-column with an ellipsis instead
	 * of wrapping, so every emitted row is one physical terminal line.
	 */
	width?: number;
}

/**
 * Render a diff string with colored lines and intra-line change highlighting.
 * - Context lines: dim/gray
 * - Removed lines: red, changed tokens in the word-removed foreground
 * - Added lines: green, changed tokens in the word-added foreground
 *
 * With `options.width >= SIDE_BY_SIDE_MIN_WIDTH` the same diff renders as two
 * equal columns (`renderSideBySideDiff`): removed lines on the left with their
 * old line numbers, added lines on the right with their new line numbers,
 * paired row by row within each change run.
 */
export function renderDiff(diffText: string, options: RenderDiffOptions = {}): string {
	if (options.width !== undefined && options.width >= SIDE_BY_SIDE_MIN_WIDTH) {
		return renderSideBySideDiff(diffText, { ...options, width: options.width });
	}
	const renderTheme = options.theme ?? activeTheme;
	const lines = sanitizeText(diffText).split("\n");
	const result: string[] = [];
	const parsedLines = lines.map(parseDiffLine);
	// Reserve 3 gutter digits: a streaming preview re-renders this diff as it
	// grows, and a width derived purely from the current max line number widens
	// at the 100-line crossing — re-padding every already-rendered row, which
	// breaks the transcript's append-only commit detection and forces a full
	// recommit of the block into native scrollback. A constant gutter through
	// 999 lines keeps streamed rows byte-identical to the final result render.
	const lineNumberWidth = parsedLines.reduce((width, parsed) => {
		const lineNumber = parsed?.lineNum.trim() ?? "";
		return Math.max(width, lineNumber.length);
	}, 3);

	// Batch-highlight context (unedited) lines so consecutive lines tokenize
	// with full multi-line context. Highlighting is a no-op when no language
	// can be detected from the file path.
	const contextHighlights = highlightContextLines(parsedLines, options.filePath, renderTheme);
	// Track the line number rendered on the previous emitted line so we can
	// blank out duplicate gutters. Two cases trigger this:
	//  1. Single-line replacement (`-N` followed by `+N`) — the `+N` repeats `N`.
	//  2. Insertion followed by context (`+N` then ` N` if producer used oldLine).
	let prevLineNum = "";

	const formatLine = (prefix: CodeFrameMarker, lineNum: string, content: string): string => {
		if (lineNum.trim().length === 0) {
			prevLineNum = "";
			return `${prefix}${content}`;
		}
		const trimmed = lineNum.trim();
		const displayNum = trimmed === prevLineNum ? "" : trimmed;
		prevLineNum = trimmed;
		return formatCodeFrameLine(prefix, displayNum, content, lineNumberWidth);
	};

	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		const parsed = parsedLines[i];

		if (!parsed) {
			prevLineNum = "";
			// Blank gap rows (and legacy "..." markers from older transcripts)
			// mark non-contiguous diff regions; display them as a single dim
			// unicode ellipsis.
			const trimmed = line.trim();
			const isGapRow = trimmed.length === 0 || trimmed === "..." || trimmed === "…";
			result.push(renderTheme.fg("toolDiffContext", isGapRow ? "…" : replaceTabs(line)));
			i++;
			continue;
		}

		if (parsed.prefix === "-") {
			const removedLines: { prefix: CodeFrameMarker; lineNum: string; content: string }[] = [];
			while (i < lines.length) {
				const p = parsedLines[i];
				if (p?.prefix !== "-") break;
				removedLines.push(p);
				i++;
			}

			const addedLines: { prefix: CodeFrameMarker; lineNum: string; content: string }[] = [];
			while (i < lines.length) {
				const p = parsedLines[i];
				if (p?.prefix !== "+") break;
				addedLines.push(p);
				i++;
			}

			if (removedLines.length === 1 && addedLines.length === 1) {
				const removed = removedLines[0];
				const added = addedLines[0];

				const { removedLine, addedLine } = renderIntraLineDiff(
					replaceTabs(removed.content),
					replaceTabs(added.content),
					renderTheme,
				);

				result.push(
					renderTheme.fg("toolDiffRemoved", formatLine("-", removed.lineNum, visualizeIndent(removedLine))),
				);
				result.push(renderTheme.fg("toolDiffAdded", formatLine("+", added.lineNum, visualizeIndent(addedLine))));
			} else {
				for (const removed of removedLines) {
					result.push(
						renderTheme.fg("toolDiffRemoved", formatLine("-", removed.lineNum, visualizeIndent(removed.content))),
					);
				}
				for (const added of addedLines) {
					result.push(
						renderTheme.fg("toolDiffAdded", formatLine("+", added.lineNum, visualizeIndent(added.content))),
					);
				}
			}
		} else if (parsed.prefix === "+") {
			result.push(renderTheme.fg("toolDiffAdded", formatLine("+", parsed.lineNum, visualizeIndent(parsed.content))));
			i++;
		} else {
			const highlighted = contextHighlights.get(i);
			const content = highlighted !== undefined ? replaceTabs(highlighted) : visualizeIndent(parsed.content);
			result.push(renderTheme.fg("toolDiffContext", formatLine(" ", parsed.lineNum, content)));
			i++;
		}
	}

	return result.join("\n");
}

/**
 * One side of a side-by-side row's padded gutter: marker and line number
 * concatenated (as `formatCodeFrameLine` does), right-padded with spaces to the
 * shared gutter width. A missing number keeps its bare marker (`   +`), an
 * empty placeholder cell collapses to spaces.
 */
function sideBySideGutter(marker: string, lineNumber: string, gutterWidth: number): string {
	const gutterText = marker && lineNumber ? `${marker}${lineNumber}` : lineNumber || marker;
	return gutterText.padStart(gutterWidth, " ");
}

/**
 * Two-column (side-by-side) rendering for wide frames: the removal side on the
 * left with its old line numbers, the addition side on the right with its new
 * line numbers, a one-cell `statusLineSep` divider between them. Rows are
 * paired in sequence within each change run (first `-` with first `+`, and so
 * on); a lone removal or addition leaves the opposite side as a blank
 * placeholder so the grid stays rectangular. Context lines render identically
 * on both sides.
 *
 * Width contract: every emitted row is a single physical line whose visible
 * width is at most `options.width` — column content is truncated in-column
 * (ellipsis when cut, CJK-aware via the native width engine) and padded back
 * out with spaces, so alignment never depends on color codes and survives
 * NO_COLOR. Collapse semantics are unaffected: `truncateDiffByHunk` still
 * budgets raw diff lines, and because a paired row consumes one line from each
 * side, the rendered pair-row count never exceeds the raw-line budget it was
 * built from.
 */
function renderSideBySideDiff(diffText: string, options: RenderDiffOptions & { width: number }): string {
	const renderTheme = options.theme ?? activeTheme;
	const lines = sanitizeText(diffText).split("\n");
	const parsedLines = lines.map(parseDiffLine);
	// Same constant 3-digit gutter reservation as the unified view: a streaming
	// preview re-renders this diff as it grows, and a width derived purely from
	// the current max line number would re-pad every already-rendered row at a
	// digit crossing.
	const lineNumberWidth = parsedLines.reduce((width, parsed) => {
		const lineNumber = parsed?.lineNum.trim() ?? "";
		return Math.max(width, lineNumber.length);
	}, 3);
	const gutterWidth = lineNumberWidth + 1;
	// Two equal columns, each `gutter │ content`, plus the one-cell divider:
	// ` -12│old content │ +13│new content`. The floor keeps the strict row-width
	// guarantee when an odd remainder leaves a spare column unused.
	const fixedWidth = (gutterWidth + 1) * 2 + 1;
	const columnWidth = Math.max(1, Math.floor((options.width - fixedWidth) / 2));
	// Word-level emphasis only when the column is wide enough to stay legible
	// (see SIDE_BY_SIDE_MIN_WORD_DIFF_COLUMN); narrower cells keep whole-line colors.
	const useWordDiff = columnWidth >= SIDE_BY_SIDE_MIN_WORD_DIFF_COLUMN;

	const contextHighlights = highlightContextLines(parsedLines, options.filePath, renderTheme);

	// Running old/new line cursors, mirroring nativeDiff: a parsed number past a
	// cursor means unchanged lines were skipped, so both sides advance together
	// and the old→new offset is preserved. Context rows are numbered with old
	// numbers (the producer's contract), so the right cell derives its new-side
	// number as old number + offset.
	let nextOld = 1;
	let nextNew = 1;

	const blankGutter = " ".repeat(gutterWidth);
	const blankContent = " ".repeat(columnWidth);
	const divider = renderTheme.fg("statusLineSep", "│");

	/** Truncate to the column (ellipsis when cut) and pad back out to the exact column width. */
	const fitColumn = (content: string): string => {
		const clipped = truncateToWidth(content, columnWidth);
		const padWidth = columnWidth - visibleWidth(clipped);
		return padWidth > 0 ? clipped + padding(padWidth) : clipped;
	};

	/** One column: colored gutter + rail + width-fitted content. */
	const cell = (gutter: string, content: string, color: ThemeColor | null): string => {
		const body = `${gutter}│${content}`;
		return color ? renderTheme.fg(color, body) : body;
	};

	const row = (
		leftGutter: string,
		leftContent: string,
		rightGutter: string,
		rightContent: string,
		leftColor: ThemeColor | null,
		rightColor: ThemeColor | null,
	): string => cell(leftGutter, leftContent, leftColor) + divider + cell(rightGutter, rightContent, rightColor);

	/** Advance the cursors past one parsed row; returns the numbers each column shows (`""` = none). */
	const consume = (parsed: {
		prefix: CodeFrameMarker;
		lineNum: string;
	}): { leftNumber: string; rightNumber: string } => {
		const trimmedNumber = parsed.lineNum.trim();
		const number = Number.parseInt(trimmedNumber, 10);
		const added = parsed.prefix === "+";
		if (Number.isFinite(number) && number !== (added ? nextNew : nextOld)) {
			// The skipped lines are unchanged: both sides move by as many.
			const skipped = number - (added ? nextNew : nextOld);
			nextOld += skipped;
			nextNew += skipped;
		}
		let leftNumber = "";
		let rightNumber = "";
		if (parsed.prefix === "-") {
			leftNumber = trimmedNumber;
		} else if (added) {
			rightNumber = trimmedNumber;
		} else {
			// Context rows carry old numbers (the producer's contract); the
			// right cell derives its new-side number from the running offset.
			leftNumber = trimmedNumber;
			rightNumber = Number.isFinite(number) ? String(number + (nextNew - nextOld)) : "";
		}
		if (parsed.prefix !== "+") nextOld++;
		if (parsed.prefix !== "-") nextNew++;
		return { leftNumber, rightNumber };
	};

	/**
	 * A cell body for one parsed row. Numbered rows keep their marker in the
	 * gutter (`-12│content`, matching the unified view's code-frame gutter);
	 * numberless rows (legacy `+1│…` transcripts whose number is part of the
	 * content, or streaming rows without numbers) render the marker glued to
	 * the content after a blank gutter — the same shape the unified view's
	 * `prefix + content` fallback produces, so `+40│line 39` stays findable.
	 */
	const changeCell = (
		parsed: { prefix: CodeFrameMarker; lineNum: string; content: string },
		side: "left" | "right",
		lineNumber: string,
		intraLine: string | undefined,
	): { gutter: string; body: string } => {
		const numberless = lineNumber.length === 0;
		const emphasized = intraLine !== undefined ? intraLine : replaceTabs(parsed.content);
		const body = visualizeIndent(emphasized);
		return {
			gutter: numberless ? blankGutter : sideBySideGutter(side === "left" ? "-" : "+", lineNumber, gutterWidth),
			body: numberless ? `${parsed.prefix}${body}` : body,
		};
	};

	/** Context cell: numbered rows show the line number, numberless rows glue the (space) marker. */
	const contextCell = (
		parsed: { prefix: CodeFrameMarker; lineNum: string },
		lineNumber: string,
		body: string,
	): {
		gutter: string;
		body: string;
	} => ({
		gutter: lineNumber.length === 0 ? blankGutter : sideBySideGutter("", lineNumber, gutterWidth),
		body: lineNumber.length === 0 ? `${parsed.prefix}${body}` : body,
	});

	const rows: string[] = [];
	let i = 0;
	while (i < lines.length) {
		const parsed = parsedLines[i];

		if (!parsed) {
			// Blank gap rows (and legacy "..." markers from older transcripts)
			// mark non-contiguous diff regions; display them as a single dim
			// unicode ellipsis spanning the row, exactly like the unified view.
			const trimmed = lines[i].trim();
			const isGapRow = trimmed.length === 0 || trimmed === "..." || trimmed === "…";
			rows.push(
				isGapRow
					? renderTheme.fg("toolDiffContext", "…")
					: renderTheme.fg("toolDiffContext", truncateToWidth(replaceTabs(lines[i]), options.width)),
			);
			i++;
			continue;
		}

		if (parsed.prefix === "-") {
			const removedLines: { prefix: CodeFrameMarker; lineNum: string; content: string }[] = [];
			while (i < lines.length && parsedLines[i]?.prefix === "-") {
				removedLines.push(parsedLines[i]!);
				i++;
			}
			const addedLines: { prefix: CodeFrameMarker; lineNum: string; content: string }[] = [];
			while (i < lines.length && parsedLines[i]?.prefix === "+") {
				addedLines.push(parsedLines[i]!);
				i++;
			}

			// Pair in sequence: removed[k] shares a row with added[k]; the longer
			// run's leftovers occupy their row alone with the opposite side blank.
			const pairCount = Math.max(removedLines.length, addedLines.length);
			for (let k = 0; k < pairCount; k++) {
				const removed = removedLines[k];
				const added = addedLines[k];
				let left = { gutter: blankGutter, body: blankContent };
				let right = { gutter: blankGutter, body: blankContent };
				let leftColor: ThemeColor | null = null;
				let rightColor: ThemeColor | null = null;
				let intra: { removedLine: string; addedLine: string } | undefined;
				if (removed && added && useWordDiff) {
					intra = renderIntraLineDiff(replaceTabs(removed.content), replaceTabs(added.content), renderTheme);
				}
				if (removed) {
					const { leftNumber } = consume(removed);
					left = changeCell(removed, "left", leftNumber, intra?.removedLine);
					leftColor = "toolDiffRemoved";
				}
				if (added) {
					const { rightNumber } = consume(added);
					right = changeCell(added, "right", rightNumber, intra?.addedLine);
					rightColor = "toolDiffAdded";
				}
				rows.push(
					row(left.gutter, fitColumn(left.body), right.gutter, fitColumn(right.body), leftColor, rightColor),
				);
			}
			continue;
		}

		if (parsed.prefix === "+") {
			const { rightNumber } = consume(parsed);
			const added = changeCell(parsed, "right", rightNumber, undefined);
			rows.push(row(blankGutter, blankContent, added.gutter, fitColumn(added.body), null, "toolDiffAdded"));
			i++;
			continue;
		}

		// Context row: identical content on both sides; the right gutter carries
		// the derived new-side number.
		const { leftNumber, rightNumber } = consume(parsed);
		const highlighted = contextHighlights.get(i);
		const content =
			highlighted !== undefined ? replaceTabs(highlighted) : visualizeIndent(replaceTabs(parsed.content));
		const leftContext = contextCell(parsed, leftNumber, content);
		const rightContext = contextCell(parsed, rightNumber, content);
		rows.push(
			row(
				leftContext.gutter,
				fitColumn(leftContext.body),
				rightContext.gutter,
				fitColumn(rightContext.body),
				"toolDiffContext",
				"toolDiffContext",
			),
		);
		i++;
	}

	return rows.join("\n");
}

/**
 * Batch-highlight runs of consecutive context lines.
 * Returns a map keyed by index in `parsedLines` to the highlighted content
 * for that line. Lines whose language is unknown are not added to the map,
 * letting callers fall back to the existing rendering path.
 */
function highlightContextLines(
	parsedLines: Array<{ prefix: CodeFrameMarker; lineNum: string; content: string } | null>,
	filePath: string | undefined,
	renderTheme: Theme,
): Map<number, string> {
	const map = new Map<number, string>();
	const lang = filePath ? getLanguageFromPath(filePath) : undefined;
	if (!lang) return map;

	let runIndices: number[] = [];
	let runContents: string[] = [];
	const flush = () => {
		if (runContents.length === 0) return;
		const highlighted = highlightCode(runContents.join("\n"), lang, renderTheme);
		for (let k = 0; k < runIndices.length; k++) {
			map.set(runIndices[k], highlighted[k] ?? runContents[k]);
		}
		runIndices = [];
		runContents = [];
	};

	for (let j = 0; j < parsedLines.length; j++) {
		const p = parsedLines[j];
		// Collapse markers ("...") are emitted as context lines but are not real
		// code; highlighting them produces nonsense (e.g. "..." → spread operator)
		// and would also stitch together unrelated context blocks across the gap.
		const isCollapseMarker = p?.prefix === " " && (p.content === "..." || p.content === "…");
		if (p && p.prefix === " " && !isCollapseMarker) {
			runIndices.push(j);
			runContents.push(p.content);
		} else {
			flush();
		}
	}
	flush();
	return map;
}
