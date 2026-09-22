import { createRequire } from 'node:module';

/** Strings are indexed from the low E (0) to the high e (5). */
export interface Barre {
  fret: number;
  from: number;
  to: number;
}

/** Absolute frets per string: -1 muted, 0 open. Fingers: 0 = none. */
export interface Shape {
  frets: number[];
  fingers: number[];
  barre?: Barre;
}

export interface ParsedChord {
  root: string;
  quality: string;
  bass?: string;
}

interface DbPosition {
  frets: number[];
  fingers: number[];
  baseFret: number;
  barres: number[];
}

interface GuitarDb {
  chords: Record<string, { suffix: string; positions: DbPosition[] }[]>;
}

const require = createRequire(import.meta.url);
const db = require('@tombatossals/chords-db/lib/guitar.json') as GuitarDb;

const DB_KEYS = ['C', 'Csharp', 'D', 'Eb', 'E', 'F', 'Fsharp', 'G', 'Ab', 'A', 'Bb', 'B'];
const DB_BASS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const NATURAL: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const OPEN_MIDI = [40, 45, 50, 55, 59, 64];

const CHORD_RE =
  /^([A-G][#b]?)((?:maj|min|dim|aug|sus|add|m|M|\d|[()#b+\-°ºøΔ]|\/(?=[\d#b]))*)(?:\/([A-G][#b]?))?$/;

export function notePitch(note: string): number {
  let pitch = NATURAL[note[0]];
  for (const accidental of note.slice(1)) pitch += accidental === '#' ? 1 : -1;
  return (pitch + 12) % 12;
}

export function parseChord(name: string): ParsedChord | undefined {
  const m = CHORD_RE.exec(name);
  if (!m) return undefined;
  return { root: m[1], quality: m[2], bass: m[3] };
}

export function isChord(token: string): boolean {
  const inner = token.startsWith('(') && token.endsWith(')') ? token.slice(1, -1) : token;
  return CHORD_RE.test(inner);
}

/**
 * Maps the quality part of a chord name, in the Brazilian notation used by most
 * cifra sites (7M, 4, (9), º, m7(5-)...), to the chords-db suffix. Keys are
 * written without parentheses, which are stripped before the lookup.
 */
const SUFFIXES: Record<string, string> = {
  '': 'major', M: 'major', maj: 'major',
  m: 'minor', min: 'minor', '-': 'minor',
  '7': '7',
  m7: 'm7', min7: 'm7', '-7': 'm7',
  '7M': 'maj7', maj7: 'maj7', M7: 'maj7', '7+': 'maj7', Δ: 'maj7', Δ7: 'maj7',
  m7M: 'mmaj7', mmaj7: 'mmaj7', mM7: 'mmaj7', 'm7+': 'mmaj7',
  '4': 'sus4', sus4: 'sus4', sus: 'sus4',
  '2': 'sus2', sus2: 'sus2', '59': 'sus2',
  '9': 'add9', add9: 'add9', add2: 'add9',
  m9: 'madd9', madd9: 'madd9',
  '79': '9', '7/9': '9',
  m79: 'm9', 'm7/9': 'm9',
  '7M9': 'maj9', maj9: 'maj9',
  '7M11+': 'maj7#11', '7M#11': 'maj7#11', '7M+11': 'maj7#11', 'maj7#11': 'maj7#11',
  '6': '6', m6: 'm6', '69': '69', '6/9': '69', m69: 'm69', 'm6/9': 'm69',
  '74': '7sus4', '7/4': '7sus4', '47': '7sus4', '4/7': '7sus4', '7sus4': '7sus4', '7sus': '7sus4',
  '7b9': '7b9', '79-': '7b9', '7-9': '7b9',
  '7#9': '7#9', '79+': '7#9', '7+9': '7#9',
  '713': '13', '13': '13', '711': '11', '11': '11', m711: 'm11', m11: 'm11',
  '7b5': '7b5', '75-': '7b5', '7-5': '7b5',
  '°': 'dim', º: 'dim', dim: 'dim', o: 'dim',
  '°7': 'dim7', º7: 'dim7', dim7: 'dim7', o7: 'dim7',
  m7b5: 'm7b5', 'm75-': 'm7b5', 'm7-5': 'm7b5', ø: 'm7b5', ø7: 'm7b5',
  '+': 'aug', aug: 'aug', '5+': 'aug', '#5': 'aug', '+5': 'aug',
  '7#5': 'aug7', '75+': 'aug7', '7+5': 'aug7', aug7: 'aug7',
  '5': '5',
};

export function toSuffix(quality: string): string | undefined {
  return SUFFIXES[quality.replace(/[()]/g, '')];
}

/** Everyday open shapes that the movable templates below don't produce. */
const OPEN_SHAPES: Record<string, string> = {
  C: 'x32010', C7: 'x32310', C7M: 'x32000', 'C(9)': 'x32033',
  D: 'xx0232', Dm: 'xx0231', D7: 'xx0212', Dm7: 'xx0211', D7M: 'xx0222', D4: 'xx0233', Dsus2: 'xx0230',
  G: '320003', G7: '320001', G7M: '320002',
  B7: 'x21202', F7M: 'xx3210', 'F7M(11+)': 'xx3200', 'E(9)': '022102', 'Em(9)': '024000', 'A(9)': 'x02420',
};

interface Template {
  frets: number[];
  fingers: number[];
}

// Barre templates with the root on the low E string (E shape) and on the A string
// (A shape), written relative to the root fret.
const E_SHAPES: Record<string, Template> = {
  major: { frets: [0, 2, 2, 1, 0, 0], fingers: [1, 3, 4, 2, 1, 1] },
  minor: { frets: [0, 2, 2, 0, 0, 0], fingers: [1, 3, 4, 1, 1, 1] },
  '7': { frets: [0, 2, 0, 1, 0, 0], fingers: [1, 3, 1, 2, 1, 1] },
  m7: { frets: [0, 2, 0, 0, 0, 0], fingers: [1, 3, 1, 1, 1, 1] },
  maj7: { frets: [0, -1, 1, 1, 0, -1], fingers: [1, 0, 3, 4, 2, 0] },
  sus4: { frets: [0, 2, 2, 2, 0, 0], fingers: [1, 2, 3, 4, 1, 1] },
  '5': { frets: [0, 2, 2, -1, -1, -1], fingers: [1, 3, 4, 0, 0, 0] },
};

const A_SHAPES: Record<string, Template> = {
  major: { frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 1, 2, 3, 4, 1] },
  minor: { frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 1, 3, 4, 2, 1] },
  '7': { frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 1, 3, 1, 4, 1] },
  m7: { frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 1, 3, 1, 2, 1] },
  maj7: { frets: [-1, 0, 2, 1, 2, 0], fingers: [0, 1, 3, 2, 4, 1] },
  sus4: { frets: [-1, 0, 2, 2, 3, 0], fingers: [0, 1, 2, 3, 4, 1] },
  sus2: { frets: [-1, 0, 2, 2, 0, 0], fingers: [0, 1, 3, 4, 1, 1] },
  m7b5: { frets: [-1, 0, 1, 0, 1, -1], fingers: [0, 1, 3, 2, 4, 0] },
  '5': { frets: [-1, 0, 2, 2, -1, -1], fingers: [0, 1, 3, 4, 0, 0] },
};

const openShapes = new Map<string, Shape>();
for (const [name, spec] of Object.entries(OPEN_SHAPES)) {
  const chord = parseChord(name)!;
  openShapes.set(`${notePitch(chord.root)}:${toSuffix(chord.quality)}`, parseShapeSpec(spec)!);
}

function barreFromFingers(frets: number[], fingers: number[]): Barre | undefined {
  const strings = fingers.flatMap((finger, i) => (finger === 1 && frets[i] > 0 ? [i] : []));
  if (strings.length < 2) return undefined;
  const fret = Math.min(...strings.map((i) => frets[i]));
  const onFret = strings.filter((i) => frets[i] === fret);
  if (onFret.length < 2) return undefined;
  return { fret, from: onFret[0], to: onFret[onFret.length - 1] };
}

/** Guesses a fingering: lower frets get lower fingers, and a barre when more than four notes are pressed. */
export function fingerShape(frets: number[]): Shape {
  const fingers = frets.map(() => 0);
  const pressed = frets.flatMap((fret, i) => (fret > 0 ? [{ fret, i }] : []));
  if (!pressed.length) return { frets, fingers };

  const min = Math.min(...pressed.map((n) => n.fret));
  let barre: Barre | undefined;
  let rest = pressed;
  let next = 1;
  if (pressed.length > 4) {
    const atMin = pressed.filter((n) => n.fret === min);
    const from = atMin[0].i;
    const to = atMin[atMin.length - 1].i;
    if (atMin.length > 1 && frets.slice(from, to + 1).every((fret) => fret >= min)) {
      barre = { fret: min, from, to };
      for (const n of atMin) fingers[n.i] = 1;
      rest = pressed.filter((n) => n.fret !== min);
      next = 2;
    }
  }
  rest.sort((a, b) => a.fret - b.fret || a.i - b.i);
  for (const n of rest) {
    const finger = Math.min(4, Math.max(next, n.fret - min + 1));
    fingers[n.i] = finger;
    next = finger + 1;
  }
  return { frets, fingers, barre };
}

/**
 * Parses a shape written as `x32010`, `x 3 2 0 1 0` or with explicit fingers
 * after a bar: `x 5 7 7 5 5 | 0 1 3 4 1 1`.
 */
export function parseShapeSpec(spec: string): Shape | undefined {
  const [fretPart, fingerPart] = spec.split('|').map((part) => part.trim());
  const frets = splitSpec(fretPart).map((t) => (/^[xX-]$/.test(t) ? -1 : Number(t)));
  if (frets.length !== 6 || frets.some((f) => !Number.isInteger(f))) return undefined;
  if (!fingerPart) return fingerShape(frets);

  const fingers = splitSpec(fingerPart).map((t) => (/^[xX-]$/.test(t) ? 0 : Number(t)));
  if (fingers.length !== 6 || fingers.some((f) => !Number.isInteger(f))) return undefined;
  return { frets, fingers, barre: barreFromFingers(frets, fingers) };
}

function splitSpec(part: string): string[] {
  const tokens = part.split(/[\s,]+/).filter(Boolean);
  return tokens.length === 1 && tokens[0].length === 6 ? [...tokens[0]] : tokens;
}

function placeTemplate(template: Template, rootFret: number): Shape {
  const frets = template.frets.map((f) => (f < 0 ? -1 : f + rootFret));
  if (rootFret === 0) return fingerShape(frets);
  return { frets, fingers: template.fingers, barre: barreFromFingers(frets, template.fingers) };
}

function lowestFret(shape: Shape): number {
  const pressed = shape.frets.filter((f) => f > 0);
  return pressed.length ? Math.min(...pressed) : 0;
}

function movableShape(pitch: number, suffix: string): Shape | undefined {
  const options: Shape[] = [];
  if (E_SHAPES[suffix]) options.push(placeTemplate(E_SHAPES[suffix], (pitch - 4 + 12) % 12));
  if (A_SHAPES[suffix]) options.push(placeTemplate(A_SHAPES[suffix], (pitch - 9 + 12) % 12));
  return options.sort((a, b) => lowestFret(a) - lowestFret(b))[0];
}

function bassPitch(shape: Shape): number | undefined {
  const i = shape.frets.findIndex((f) => f >= 0);
  return i < 0 ? undefined : (OPEN_MIDI[i] + shape.frets[i]) % 12;
}

function dbShape(pitch: number, suffix: string): Shape | undefined {
  const chord = db.chords[DB_KEYS[pitch]]?.find((c) => c.suffix === suffix);
  if (!chord) return undefined;
  const shapes = chord.positions.map((p): Shape => {
    const frets = p.frets.map((f) => (f <= 0 ? f : f + p.baseFret - 1));
    return { frets, fingers: p.fingers, barre: barreFromFingers(frets, p.fingers) };
  });
  // Prefer low positions with the root in the bass.
  const score = (s: Shape) => lowestFret(s) + (bassPitch(s) === pitch ? 0 : 6);
  return shapes.sort((a, b) => score(a) - score(b))[0];
}

/** Puts `bass` as the lowest note, on the low E or the A string, if it stays within reach. */
function withBass(shape: Shape, bass: number): Shape | undefined {
  for (const string of [0, 1]) {
    const fret = (bass - OPEN_MIDI[string] + 120) % 12;
    const frets = shape.frets.map((f, i) => (i < string ? -1 : i === string ? fret : f));
    const pressed = frets.filter((f) => f > 0);
    const inReach = !pressed.length || Math.max(...pressed) - Math.min(...pressed) <= 3;
    const bassMidi = OPEN_MIDI[string] + fret;
    const isLowest = frets.every((f, i) => f < 0 || i <= string || OPEN_MIDI[i] + f >= bassMidi);
    if (inReach && isLowest) return fingerShape(frets);
  }
  return undefined;
}

function baseShape(pitch: number, suffix: string): Shape | undefined {
  return openShapes.get(`${pitch}:${suffix}`) ?? movableShape(pitch, suffix) ?? dbShape(pitch, suffix);
}

/** Finds a shape for a chord name. Custom shapes, keyed by the exact name, win. */
export function resolveShape(name: string, custom: Record<string, Shape> = {}): Shape | undefined {
  if (custom[name]) return custom[name];
  const chord = parseChord(name);
  if (!chord) return undefined;
  const suffix = toSuffix(chord.quality);
  if (!suffix) return undefined;

  const pitch = notePitch(chord.root);
  const base = baseShape(pitch, suffix);
  if (!chord.bass || notePitch(chord.bass) === pitch) return base;

  const bass = notePitch(chord.bass);
  const slashSuffix = `${suffix === 'minor' ? 'm' : ''}/${DB_BASS[bass]}`;
  return (base && withBass(base, bass)) ?? dbShape(pitch, slashSuffix) ?? base;
}
