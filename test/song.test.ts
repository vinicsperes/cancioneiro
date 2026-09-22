import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isChordLine, mergeChords, parseSong, songChords } from '../src/song.ts';

test('tells chord lines from lyrics', () => {
  assert.ok(isChordLine('Em            D    C'));
  assert.ok(isChordLine('  C#m  E  E9  E  |  (2x)'));
  assert.ok(!isChordLine('Em casa eu fico'));
  assert.ok(!isChordLine('E agora José'));
});

test('splits the lyric where each chord starts, down to the syllable', () => {
  const segments = mergeChords('    G        Em      D', 'And grace my fears relieved');
  assert.deepEqual(segments, [
    { text: 'And ' },
    { chord: 'G', text: 'grace my ' },
    { chord: 'Em', text: 'fears re', join: true },
    { chord: 'D', text: 'lieved' },
  ]);
});

test('keeps chords that hang past the end of the lyric', () => {
  const segments = mergeChords('G        D', 'Oh yeah');
  assert.deepEqual(segments, [
    { chord: 'G', text: 'Oh yeah  ' },
    { chord: 'D', text: '' },
  ]);
});

test('parses header, sections, chord-only lines and tabs', () => {
  const song = parseSong(`---
titulo: Teste
artista: Alguém
capo: 2
acorde: D5(9) = x57755
---

[Intro] C#m  E  E9  E
        Em  D5(9)  C

[Refrão]
G         D
Lá vem o sol

[Solo]
e|--0--2--|
B|--------|
`);
  assert.equal(song.title, 'Teste');
  assert.equal(song.capo, '2');
  assert.deepEqual(song.shapes, { 'D5(9)': 'x57755' });
  assert.deepEqual(
    song.blocks.map((b) => [b.label, b.chorus, b.lines.map((l) => l.type)]),
    [
      ['Intro', false, ['chords', 'chords']],
      ['Refrão', true, ['lyric']],
      ['Solo', false, ['tab']],
    ],
  );
  assert.deepEqual(songChords(song), ['C#m', 'E', 'E9', 'Em', 'D5(9)', 'C', 'G', 'D']);
});

test('reads the key from a pasted "Tom:" line and ignores non-breaking spaces', () => {
  const song = parseSong('Tom: D\n\nEm\u00a0\u00a0\u00a0D\nAll alone');
  assert.equal(song.key, 'D');
  assert.deepEqual(song.blocks[0].lines[0], {
    type: 'lyric',
    segments: [
      { chord: 'Em', text: 'All a', join: true },
      { chord: 'D', text: 'lone' },
    ],
  });
});
