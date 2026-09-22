# cancioneiro

Turns plain-text chord sheets (chords above the lyrics, as on most chord sites) into
print-ready A4 pages for a songbook binder.

- Each chord sits on the exact syllable where it changes, even mid-word.
- Diagrams with finger numbers for every chord in the song.
- Songs are fitted to a single sheet when possible (one or two columns, 15–11pt),
  otherwise they carry over to numbered sheets.

## Setup

Requires Node 24+ and Google Chrome (or set `CHROME_PATH` to another Chromium).

```sh
npm install
```

## Usage

Copy a chord sheet, then:

```sh
npm run nova                              # title and artist read from the pasted text
npm run nova -- "Song title" "Artist"     # or given explicitly
npm run pdf                               # rebuild every song in musicas/
npm run pdf -- musicas/artist--song.txt   # rebuild one
```

Text is read from the clipboard, or from stdin when piped. Songs are saved to
`musicas/artist--title.txt` and PDFs to `saida/` under the same name, so both sort by
artist: a new song slots into its place in the binder. Pasting a song that already
exists asks before replacing it.

## Song format

```text
---
titulo: Amazing Grace
artista: John Newton
tom: G
capo: 2
batida: ↓ ↓↑ ↑↓↑
acorde: D5(9) = x57755
---

[Intro] G  C  G  D

[Refrão]
 G      G7         C         G
Amazing grace, how sweet the sound
```

`[Section]` labels a block (choruses get a side bar), and tab lines (`e|--0--|`) keep a
monospaced font and wrap to fit the column. `tabs: não` in the header leaves the tabs
out, with the sections that hold nothing else; `npm run nova` asks when the pasted text
has tabs. Brazilian chord notation is understood: `7M`, `4`, `(9)`, `º`,
`m7(5-)`, `D/F#`…

Chord shapes come from common open voicings, then the lowest barre shape, then
[chords-db](https://github.com/tombatossals/chords-db). To override one, add
`acorde: NAME = frets` to a song, or a `NAME = frets` line to `acordes.txt` for all
songs. Frets go from the low E string to the high one, `x` for muted, with optional
fingers after `|`: `x 5 7 7 5 5 | 0 1 3 4 1 1`.

## License

MIT
