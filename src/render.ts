import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isChord, parseShapeSpec, resolveShape, type Shape } from './chords.ts';
import { chordSvg } from './diagram.ts';
import { sliceTab, songChords, type Block, type Line, type Song } from './song.ts';

const require = createRequire(import.meta.url);

function fontFace(family: string, file: string, weight: number): string {
  const data = readFileSync(require.resolve(file)).toString('base64');
  return `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff2;base64,${data}) format('woff2')}`;
}

let fonts: string | undefined;
function fontCss(): string {
  fonts ??= [
    fontFace('Hyperlegible', '@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-400-normal.woff2', 400),
    fontFace('Hyperlegible', '@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-700-normal.woff2', 700),
    fontFace('HyperlegibleMono', '@fontsource/atkinson-hyperlegible-mono/files/atkinson-hyperlegible-mono-latin-400-normal.woff2', 400),
    fontFace('HyperlegibleMono', '@fontsource/atkinson-hyperlegible-mono/files/atkinson-hyperlegible-mono-latin-700-normal.woff2', 700),
  ].join('\n');
  return fonts;
}

const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

/** An optional `marca.png` next to the sources is printed in the top right corner. */
function markImg(): string {
  const file = new URL('../marca.png', import.meta.url);
  if (!existsSync(file)) return '';
  const data = readFileSync(file).toString('base64');
  return `<img class="mark" alt="" src="data:image/png;base64,${data}">`;
}

function esc(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function chordToken(token: string): string {
  return isChord(token) ? `<b class="ch">${esc(token)}</b>` : `<span class="fill">${esc(token)}</span>`;
}

function renderLine(line: Line): string {
  switch (line.type) {
    case 'tab': {
      const slices = sliceTab(line.rows, line.chords).map((slice, k) => {
        const chords = line.chords ? `<b class="ch">${esc(slice.chords)}</b>` : '';
        // The string names get repeated on every line the tab wraps onto.
        const names = k === 0 && slice.rows.every((row) => /^[A-Ga-g][#b]?\s*\|$/.test(row));
        return `<span class="ts${names ? ' names' : ''}">${chords}${esc(slice.rows.join('\n'))}</span>`;
      });
      return `<div class="line tab">${slices.join('')}</div>`;
    }
    case 'chords':
      return `<div class="line chords-only">${line.tokens.map(chordToken).join('')}</div>`;
    case 'lyric': {
      const hasChords = line.segments.some((s) => s.chord);
      const segs = line.segments.map((s) => {
        const chord = hasChords ? `<b class="ch">${esc(s.chord ?? '')}</b>` : '';
        return `<span class="seg${s.join && s.chord ? ' join' : ''}">${chord}<span class="ly">${esc(s.text)}</span></span>`;
      });
      return `<div class="line">${segs.join('')}</div>`;
    }
  }
}

function renderBlock(block: Block): string {
  const label = block.label ? `<h2 class="label">${esc(block.label)}</h2>` : '';
  return `<div class="block${block.chorus ? ' chorus' : ''}">${label}${block.lines.map(renderLine).join('')}</div>`;
}

function capoText(capo: string): string {
  return /^\d+$/.test(capo) ? `${capo}ª casa` : capo;
}

/** Diagram width shrinks so that up to ~11 chords still fit on a single row. */
function diagramWidth(count: number): number {
  const row = 183;
  const gap = 3;
  const width = Math.max(14, Math.min(22, (row - gap * (count - 1)) / count));
  return Math.floor(width * 10) / 10;
}

function head(kicker: string, title: string): string {
  return `<header class="head">
    <div class="titles">
      ${kicker ? `<p class="artist">${esc(kicker)}</p>` : ''}
      <h1>${esc(title)}</h1>
    </div>
    ${markImg()}
  </header>`;
}

function htmlPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>${fontCss()}</style>
<style>${css}</style>
</head>
<body>
${body}
</body>
</html>`;
}

export interface ChordUse {
  name: string;
  /** Ways to play it, the everyday one first. */
  shapes: Shape[];
  songs: number;
}

/** Chords per study sheet: three across, nine down, each with its variations. */
const PER_SHEET = 27;

/** Gathers finished sheets — songs, chord sheets — into one document to print. */
export function gather(title: string, sheets: string[]): string {
  return htmlPage(title, sheets.join('\n'));
}

/** Sheets of every chord in the songbook, to study away from the songs. */
export function chordSheets(chords: ChordUse[]): string[] {
  const sheets = [];
  for (let i = 0; i < chords.length; i += PER_SHEET) sheets.push(chords.slice(i, i + PER_SHEET));

  const pages = sheets.map((sheet, k) => {
    const figures = sheet.map(({ name, shapes }) => {
      const drawings = shapes.length
        ? shapes.map((shape) => `<div class="dg">${chordSvg(shape)}</div>`).join('')
        : `<div class="unknown">sem diagrama</div>`;
      return `<section class="chord"><h3>${esc(name)}</h3><div class="vars">${drawings}</div></section>`;
    });
    const foot = sheets.length > 1 ? `<footer class="foot">Acordes · ${k + 1}/${sheets.length}</footer>` : '';
    return `<main class="page">
  ${head('Cancioneiro', 'Acordes')}
  <section class="chart">${figures.join('')}</section>
  ${foot}
</main>`;
  });

  return pages;
}

export function renderChords(chords: ChordUse[]): string {
  return gather('Acordes', chordSheets(chords));
}

export interface RenderResult {
  html: string;
  missing: string[];
}

export function renderSong(song: Song, globalShapes: Record<string, Shape> = {}): RenderResult {
  const custom: Record<string, Shape> = { ...globalShapes };
  for (const [name, spec] of Object.entries(song.shapes)) {
    const shape = parseShapeSpec(spec);
    if (shape) custom[name] = shape;
  }

  const missing: string[] = [];
  const chords = songChords(song);
  const figures = chords.map((name) => {
    const shape = resolveShape(name, custom);
    if (!shape) missing.push(name);
    const drawing = shape ? chordSvg(shape) : `<div class="unknown">sem diagrama</div>`;
    return `<figure class="dg"><figcaption>${esc(name)}</figcaption>${drawing}</figure>`;
  });

  // Key, capo and strumming share one strip under the title; the mark has the corner.
  const extras = [
    song.key && `<p class="fact"><small>Tom</small><b>${esc(song.key)}</b></p>`,
    song.capo && `<p class="fact"><small>Capo</small><b>${esc(capoText(song.capo))}</b></p>`,
    song.strum && `<p class="fact"><small>Batida</small><b>${esc(song.strum)}</b></p>`,
    song.notes.length && `<ul class="notes">${song.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`,
  ].filter(Boolean);

  const html = htmlPage(
    song.title,
    `<main class="page">
  ${head(song.artist ?? '', song.title)}
  ${extras.length ? `<div class="extras">${extras.join('')}</div>` : ''}
  ${figures.length ? `<section class="diagrams" style="--dg:${diagramWidth(figures.length)}mm">${figures.join('')}</section>` : ''}
  <section class="body">${song.blocks.map(renderBlock).join('')}</section>
</main>`,
  );

  return { html, missing };
}
