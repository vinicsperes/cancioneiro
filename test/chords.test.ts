import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isChord, parseChord, parseShapeSpec, resolveShape, toSuffix } from '../src/chords.ts';

const frets = (name: string) => resolveShape(name)?.frets;

test('recognizes chord names in Brazilian notation', () => {
  for (const name of ['C', 'C#m', 'Bb7', 'A7M', 'D5(9)', 'E9', 'C#m/G#', 'Bm7(5-)', 'Gº', 'F#m7(11)', 'D/F#', '(A)']) {
    assert.ok(isChord(name), name);
  }
  for (const word of ['Amor', 'Eu', 'Deus', 'Cm7xyz', 'H']) {
    assert.ok(!isChord(word), word);
  }
});

test('splits root, quality and bass', () => {
  assert.deepEqual(parseChord('C#m/G#'), { root: 'C#', quality: 'm', bass: 'G#' });
  assert.deepEqual(parseChord('D5(9)'), { root: 'D', quality: '5(9)', bass: undefined });
});

test('maps qualities to chord suffixes', () => {
  assert.equal(toSuffix('7M'), 'maj7');
  assert.equal(toSuffix('(9)'), 'add9');
  assert.equal(toSuffix('7(9)'), '9');
  assert.equal(toSuffix('4'), 'sus4');
  assert.equal(toSuffix('m7(5-)'), 'm7b5');
  assert.equal(toSuffix('5(9)'), 'sus2');
});

test('uses open shapes for everyday chords', () => {
  assert.deepEqual(frets('C'), [-1, 3, 2, 0, 1, 0]);
  assert.deepEqual(frets('G'), [3, 2, 0, 0, 0, 3]);
  assert.deepEqual(frets('Em'), [0, 2, 2, 0, 0, 0]);
  assert.deepEqual(frets('A7'), [-1, 0, 2, 0, 2, 0]);
  assert.deepEqual(frets('E9'), [0, 2, 2, 1, 0, 2]);
});

test('uses the lowest barre shape otherwise', () => {
  const b = resolveShape('B')!;
  assert.deepEqual(b.frets, [-1, 2, 4, 4, 4, 2]);
  assert.deepEqual(b.barre, { fret: 2, from: 1, to: 5 });
  assert.deepEqual(frets('F'), [1, 3, 3, 2, 1, 1]);
  assert.deepEqual(frets('C#m'), [-1, 4, 6, 6, 5, 4]);
  assert.deepEqual(frets('Gm'), [3, 5, 5, 3, 3, 3]);
});

test('puts the bass of slash chords on the lowest string', () => {
  assert.deepEqual(frets('D/F#'), [2, -1, 0, 2, 3, 2]);
  assert.deepEqual(frets('G/B'), [-1, 2, 0, 0, 0, 3]);
  assert.deepEqual(frets('C#m/G#'), [4, 4, 6, 6, 5, 4]);
  assert.deepEqual(frets('F/C'), [-1, 3, 3, 2, 1, 1]);
});

test('falls back to the chord database', () => {
  assert.ok(resolveShape('Cdim7'));
  assert.ok(resolveShape('F#7(9)'));
});

test('custom shapes win and accept explicit fingers', () => {
  const custom = { 'D5(9)': parseShapeSpec('x 5 7 7 5 5 | 0 1 3 4 1 1')! };
  const shape = resolveShape('D5(9)', custom)!;
  assert.deepEqual(shape.frets, [-1, 5, 7, 7, 5, 5]);
  assert.deepEqual(shape.barre, { fret: 5, from: 1, to: 5 });
  assert.deepEqual(parseShapeSpec('x32010')?.frets, [-1, 3, 2, 0, 1, 0]);
  assert.equal(parseShapeSpec('x3201'), undefined);
});
