import { readFileSync } from 'node:fs';
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
  ].join('\n');
  return fonts;
}

const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

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

  const meta = [
    song.key && `<div><small>Tom</small><b>${esc(song.key)}</b></div>`,
    song.capo && `<div><small>Capo</small><b>${esc(capoText(song.capo))}</b></div>`,
  ].filter(Boolean);

  const extras = [
    song.strum && `<p class="strum"><small>Batida</small> ${esc(song.strum)}</p>`,
    song.notes.length && `<ul class="notes">${song.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`,
  ].filter(Boolean);

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${esc(song.title)}</title>
<style>${fontCss()}</style>
<style>${css}</style>
</head>
<body>
<main class="page">
  <header class="head">
    <div class="titles">
      ${song.artist ? `<p class="artist">${esc(song.artist)}</p>` : ''}
      <h1>${esc(song.title)}</h1>
    </div>
    ${meta.length ? `<div class="meta">${meta.join('')}</div>` : ''}
  </header>
  ${extras.length ? `<div class="extras">${extras.join('')}</div>` : ''}
  ${figures.length ? `<section class="diagrams" style="--dg:${diagramWidth(figures.length)}mm">${figures.join('')}</section>` : ''}
  <section class="body">${song.blocks.map(renderBlock).join('')}</section>
</main>
</body>
</html>`;

  return { html, missing };
}
