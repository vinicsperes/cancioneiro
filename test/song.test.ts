import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isChordLine,
  mergeChords,
  parseSong,
  sliceTab,
  songChords,
  splitHeading,
  stripSiteChrome,
} from '../src/song.ts';

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

test('keeps a chord line over a tab at its columns and trims the empty end of the tab', () => {
  const song = parseSong(`[Solo]
    F       G
E|----------------------|
B|--5-8---5-------------|  (2x)
G|------7---------------|
`);
  assert.deepEqual(song.blocks[0].lines, [
    {
      type: 'tab',
      chords: '    F       G',
      rows: ['E|-------------|', 'B|--5-8---5----|  (2x)', 'G|------7------|'],
    },
  ]);
  assert.deepEqual(songChords(song), ['F', 'G']);
});

test('slices a tab only where no string has a note, keeping bar lines with their measure', () => {
  const slices = sliceTab(['E|-10-|', 'B|--3-|'], '   Am ');
  assert.deepEqual(
    slices.map((s) => s.rows),
    [
      ['E|', 'B|'],
      ['-', '-'],
      ['10-|', '-3-|'],
    ],
  );
  assert.deepEqual(
    slices.map((s) => s.chords),
    ['  ', ' ', 'Am  '],
  );
});

test('leaves out the tabs and the sections that only hold tabs with "tabs: não"', () => {
  const text = `---
tabs: não
---

[Tab - Intro]

Parte 1 de 2
   D       F#
E|--2--2--|

[Primeira Parte]

Parte 1 de 1
E|--0--|
   ↓  ↑

E      B
Sometimes I feel

[Solo]

E|--5--|

[Ponte]
E|--7--|

A9
Under the bridge
`;
  const song = parseSong(text);
  assert.deepEqual(
    song.blocks.map((b) => [b.label, b.lines.map((l) => l.type)]),
    [
      ['Primeira Parte', []],
      [undefined, ['lyric']],
      ['Ponte', []],
      [undefined, ['lyric']],
    ],
  );
  assert.deepEqual(songChords(song), ['E', 'B', 'A9']);
  assert.equal(parseSong(text.replace('não', 'sim')).blocks.length, 9);
});

test('drops the menu and the credits when a whole cifra page is pasted', () => {
  const pasted = `Pular para o conteúdo

Tom

C

O Ciclo
Uniclãs

[Intro] C  Am

C
Não adianta

Composição: Nando

Revisar composição
© 1996 - 2026`;
  assert.equal(stripSiteChrome(pasted), 'O Ciclo\nUniclãs\n\n[Intro] C  Am\n\nC\nNão adianta');
  const clean = 'Row Your Boat\nTradicional\n\n[Intro] C  G';
  assert.equal(stripSiteChrome(clean), clean);
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

test('splits the title and artist off the top of a pasted cifra', () => {
  const pasted = 'Row Your Boat\nTradicional\n\n[Intro] C  G\n\nC\nRow, row';
  assert.deepEqual(splitHeading(pasted), {
    title: 'Row Your Boat',
    artist: 'Tradicional',
    body: '\n[Intro] C  G\n\nC\nRow, row',
  });
  assert.equal(splitHeading('Row Your Boat\n\nC\nRow, row').title, 'Row Your Boat');
});

test('leaves the text alone when it does not open with a heading', () => {
  for (const text of ['[Intro] C  G\n\nC\nRow, row', 'Row, row, row your boat\nGently\n\nStill lyrics']) {
    assert.deepEqual(splitHeading(text), { body: text });
  }
});
