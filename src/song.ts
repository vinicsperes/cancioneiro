import { isChord } from './chords.ts';

export interface Segment {
  chord?: string;
  text: string;
  /** The text ends mid-word and the next segment carries on the same word. */
  join?: boolean;
}

export type Line =
  | { type: 'lyric'; segments: Segment[] }
  | { type: 'chords'; tokens: string[] }
  /** `chords` is a chord line written straight above the tab, kept at its columns. */
  | { type: 'tab'; rows: string[]; chords?: string };

export interface Block {
  label?: string;
  chorus: boolean;
  lines: Line[];
}

export interface Song {
  title: string;
  artist?: string;
  key?: string;
  capo?: string;
  strum?: string;
  number?: number;
  notes: string[];
  /** Custom chord shapes from `acorde:` fields, as `name -> spec`. */
  shapes: Record<string, string>;
  blocks: Block[];
}

const FILLER_RE = /^(\|{1,2}|\/|-+|%|\.{2,}|\(?\d+x\)?|\(?x\d+\)?|N\.?C\.?|[()])$/i;
const TAB_RE = /^\s*[A-Ga-g][#b]?\s*\|.*-{2,}/;
const SECTION_RE = /^\s*\[([^\]]+)\]\s*(.*)$/;
const KEY_LINE_RE = /^\s*tom:\s*(\S.*?)\s*$/i;

export function isChordLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  const chords = tokens.filter(isChord).length;
  return chords > 0 && tokens.every((t) => isChord(t) || FILLER_RE.test(t));
}

export function isTabLine(line: string): boolean {
  return TAB_RE.test(line);
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function expandTabs(line: string): string {
  let out = '';
  for (const char of line) out += char === '\t' ? ' '.repeat(8 - (out.length % 8)) : char;
  return out;
}

/** Splits a lyric line at the columns where the chords above it start. */
export function mergeChords(chordLine: string, lyricLine: string): Segment[] {
  const chords = [...chordLine.matchAll(/\S+/g)].map((m) => ({ col: m.index, name: m[0] }));
  const indent = Math.min(chords[0].col, lyricLine.search(/\S/));
  const last = chords[chords.length - 1].col - indent;
  const lyric = lyricLine.slice(indent).padEnd(last);

  const segments: Segment[] = [];
  const first = chords[0].col - indent;
  if (first > 0) segments.push({ text: lyric.slice(0, first) });
  chords.forEach((chord, k) => {
    const start = chord.col - indent;
    const end = k + 1 < chords.length ? chords[k + 1].col - indent : undefined;
    segments.push({ chord: chord.name, text: lyric.slice(start, end) });
  });
  segments.forEach((segment, k) => {
    const next = segments[k + 1];
    if (next && /\p{L}$/u.test(segment.text) && /^\p{L}/u.test(next.text)) segment.join = true;
  });
  const tail = segments[segments.length - 1];
  tail.text = tail.text.trimEnd();
  return segments;
}

/** Cifra sites pad a tab with empty strings up to its closing bar; keeps just a bit of it. */
function trimTab(rows: string[], chords: string): [string[], string] {
  const end = rows[0].lastIndexOf('|');
  if (rows.some((row) => row.lastIndexOf('|') !== end)) return [rows, chords];
  let start = end;
  while (start > 0 && rows.every((row) => row[start - 1] === '-') && (chords[start - 1] ?? ' ') === ' ') start--;
  if (end - start <= 2) return [rows, chords];
  const cut = (row: string) => row.slice(0, start + 2) + row.slice(end);
  return [rows.map(cut), cut(chords)];
}

export interface TabSlice {
  chords: string;
  rows: string[];
}

/**
 * Cuts a tab into narrow vertical slices that end where no string has a note and
 * no chord name is written, so a tab wider than its column can wrap like a staff.
 */
export function sliceTab(rows: string[], chords = ''): TabSlice[] {
  const width = Math.max(chords.length, ...rows.map((row) => row.length));
  const chordRow = chords.padEnd(width);
  const padded = rows.map((row) => row.padEnd(width));
  const clear = (col: number) => chordRow[col] === ' ' && padded.every((row) => '-| '.includes(row[col]));
  const barline = (col: number) =>
    padded.some((row) => row[col] === '|') && padded.every((row) => '| '.includes(row[col]));

  const slices: TabSlice[] = [];
  let start = 0;
  for (let col = 0; col < width; col++) {
    const last = col + 1 === width;
    // A bar line stays with the measure it closes.
    if (!last && !(clear(col) && !barline(col + 1))) continue;
    slices.push({ chords: chordRow.slice(start, col + 1), rows: padded.map((row) => row.slice(start, col + 1)) });
    start = col + 1;
  }
  return slices;
}

function parseHeader(song: Song, lines: string[]): void {
  for (const line of lines) {
    const m = /^\s*([^:]+?)\s*:\s*(.*?)\s*$/.exec(line);
    if (!m || !m[2]) continue;
    const value = m[2];
    switch (fold(m[1])) {
      case 'titulo':
        song.title = value;
        break;
      case 'artista':
        song.artist = value;
        break;
      case 'tom':
        song.key = value;
        break;
      case 'capo':
      case 'capotraste':
        song.capo = value;
        break;
      case 'batida':
      case 'ritmo':
        song.strum = value;
        break;
      case 'numero':
        song.number = Number.parseInt(value, 10) || undefined;
        break;
      case 'obs':
      case 'nota':
        song.notes.push(value);
        break;
      case 'acorde': {
        const [name, spec] = value.split('=').map((part) => part.trim());
        if (name && spec) song.shapes[name] = spec;
        break;
      }
    }
  }
}

export function parseSong(text: string): Song {
  const song: Song = { title: '', notes: [], shapes: {}, blocks: [] };
  let lines = text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .split('\n')
    .map((line) => expandTabs(line).trimEnd());

  if (lines[0]?.trim() === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) {
      parseHeader(song, lines.slice(1, end));
      lines = lines.slice(end + 1);
    }
  }

  let block: Block | undefined;
  const open = (label?: string): Block => {
    block = { label, chorus: !!label && /refr|chorus|coro/i.test(label), lines: [] };
    song.blocks.push(block);
    return block;
  };
  const push = (line: Line) => (block ?? open()).lines.push(line);
  const close = () => {
    block = undefined;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      close();
      continue;
    }

    const keyLine = KEY_LINE_RE.exec(line);
    if (keyLine && !song.blocks.length) {
      song.key ??= keyLine[1];
      continue;
    }

    const section = SECTION_RE.exec(line);
    if (section) {
      open(section[1].trim());
      const rest = section[2];
      if (rest && isChordLine(rest)) push({ type: 'chords', tokens: rest.trim().split(/\s+/) });
      else if (rest) push({ type: 'lyric', segments: [{ text: rest }] });
      continue;
    }

    const chordsOverTab = isChordLine(line) && i + 1 < lines.length && isTabLine(lines[i + 1]);
    if (chordsOverTab || isTabLine(line)) {
      const chords = chordsOverTab ? line : undefined;
      const rows = [lines[chordsOverTab ? ++i : i]];
      while (i + 1 < lines.length && isTabLine(lines[i + 1])) rows.push(lines[++i]);
      const indent = Math.min(...[chords ?? '', ...rows].filter(Boolean).map((row) => row.search(/\S/)));
      const [trimmed, above] = trimTab(
        rows.map((row) => row.slice(indent)),
        chords?.slice(indent) ?? '',
      );
      push({ type: 'tab', rows: trimmed, ...(chords && { chords: above }) });
      continue;
    }

    if (isChordLine(line)) {
      const next = lines[i + 1];
      const pairsWithLyric =
        next !== undefined && next.trim() && !isChordLine(next) && !isTabLine(next) && !SECTION_RE.test(next);
      if (pairsWithLyric) {
        push({ type: 'lyric', segments: mergeChords(line, next) });
        i++;
      } else {
        push({ type: 'chords', tokens: line.trim().split(/\s+/) });
      }
      continue;
    }

    push({ type: 'lyric', segments: [{ text: line.trim() }] });
  }

  song.blocks = song.blocks.filter((b) => b.lines.length || b.label);
  return song;
}

/**
 * Pasted cifras often open with the title and artist, one per line, before the
 * first section or chord line. Splits them off when the text looks like that.
 */
export function splitHeading(text: string): { title?: string; artist?: string; body: string } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  const heading: string[] = [];
  while (i < lines.length && lines[i].trim()) heading.push(lines[i++].trim());

  const plain = (line: string) =>
    line.length <= 60 && !isChordLine(line) && !isTabLine(line) && !SECTION_RE.test(line) && !KEY_LINE_RE.test(line);
  const next = lines.slice(i).find((line) => line.trim());
  const cifraFollows = !!next && (SECTION_RE.test(next) || isChordLine(next) || KEY_LINE_RE.test(next));
  if (heading.length < 1 || heading.length > 2 || !heading.every(plain) || !cifraFollows) return { body: text };
  return { title: heading[0], artist: heading[1], body: lines.slice(i).join('\n') };
}

/** Chords in the order they first show up, ignoring bar marks and repeat signs. */
export function songChords(song: Song): string[] {
  const seen = new Set<string>();
  for (const block of song.blocks) {
    for (const line of block.lines) {
      const tokens =
        line.type === 'chords'
          ? line.tokens
          : line.type === 'lyric'
            ? line.segments.map((s) => s.chord ?? '')
            : (line.chords?.trim().split(/\s+/) ?? []);
      for (const token of tokens) {
        const name = token.startsWith('(') && token.endsWith(')') ? token.slice(1, -1) : token;
        if (name && isChord(name)) seen.add(name);
      }
    }
  }
  return [...seen];
}
