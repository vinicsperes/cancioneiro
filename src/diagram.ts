import type { Shape } from './chords.ts';

const STRING_GAP = 9;
const FRET_GAP = 11;
const LEFT = 9;
const TOP = 13;
const DOT = 3.7;

/** Draws a chord box in the usual layout: low E on the left, nut on top. */
export function chordSvg(shape: Shape): string {
  const pressed = shape.frets.filter((f) => f > 0);
  const max = pressed.length ? Math.max(...pressed) : 0;
  const min = pressed.length ? Math.min(...pressed) : 0;
  const base = max <= 4 ? 1 : min;
  const rows = Math.max(4, max - base + 1);
  const right = LEFT + 5 * STRING_GAP;
  const bottom = TOP + rows * FRET_GAP;
  const x = (string: number) => LEFT + string * STRING_GAP;
  const y = (fret: number) => TOP + (fret - base + 0.5) * FRET_GAP;
  const out: string[] = [];

  for (let r = 0; r <= rows; r++) {
    out.push(`<line class="fret" x1="${LEFT}" x2="${right}" y1="${TOP + r * FRET_GAP}" y2="${TOP + r * FRET_GAP}"/>`);
  }
  for (let s = 0; s < 6; s++) {
    out.push(`<line class="string" x1="${x(s)}" x2="${x(s)}" y1="${TOP}" y2="${bottom}"/>`);
  }
  if (base === 1) {
    out.push(`<rect class="nut" x="${LEFT - 0.6}" y="${TOP - 2.6}" width="${right - LEFT + 1.2}" height="2.8"/>`);
  } else {
    out.push(`<text class="base" x="${LEFT - 4}" y="${y(base)}">${base}</text>`);
  }

  shape.frets.forEach((fret, s) => {
    const cx = x(s);
    const cy = TOP - 6.5;
    if (fret < 0) {
      out.push(`<path class="mark" d="M${cx - 2.2} ${cy - 2.2}l4.4 4.4m0 -4.4l-4.4 4.4"/>`);
    } else if (fret === 0) {
      out.push(`<circle class="mark" cx="${cx}" cy="${cy}" r="2.3"/>`);
    }
  });

  const { barre } = shape;
  if (barre) {
    const by = y(barre.fret);
    out.push(
      `<rect class="dot" x="${x(barre.from) - DOT}" y="${by - DOT}" width="${x(barre.to) - x(barre.from) + 2 * DOT}" height="${2 * DOT}" rx="${DOT}"/>`,
      `<text class="finger" x="${x(barre.from)}" y="${by}">1</text>`,
    );
  }

  shape.frets.forEach((fret, s) => {
    if (fret <= 0) return;
    const underBarre = barre && fret === barre.fret && s >= barre.from && s <= barre.to;
    if (underBarre && shape.fingers[s] === 1) return;
    const cy = y(fret);
    out.push(`<circle class="dot" cx="${x(s)}" cy="${cy}" r="${DOT}"/>`);
    if (shape.fingers[s]) out.push(`<text class="finger" x="${x(s)}" y="${cy}">${shape.fingers[s]}</text>`);
  });

  const width = right + 4;
  const height = bottom + 3;
  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${out.join('')}</svg>`;
}
