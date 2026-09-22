#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { COMMON_CHORDS, notePitch, parseChord, parseShapeSpec, shapeOptions, toSuffix, type Shape } from './chords.ts';
import { launchBrowser, printPdf, renderPdf } from './pdf.ts';
import { renderChords, renderSong, type ChordUse } from './render.ts';
import { isTabLine, parseSong, songChords, splitHeading, type Song } from './song.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SONGS_DIR = join(ROOT, 'musicas');
const OUT_DIR = join(ROOT, 'saida');
const SHAPES_FILE = join(ROOT, 'acordes.txt');

const HELP = `cancioneiro — cifras em texto viram folhas A4 para imprimir

Uso:
  cancioneiro pdf [arquivos...]          gera os PDFs (sem arquivos: todas as músicas de musicas/)
  cancioneiro acordes [arquivos...]      gera saida/acordes.pdf: todos os acordes das músicas, para estudar
  cancioneiro nova ["Título"] ["Artista"] cria uma música a partir do texto copiado (ou da entrada padrão);
                                         sem título, usa as primeiras linhas do texto (título e artista)

As músicas ficam em musicas/artista--titulo.txt e os PDFs em saida/, na mesma ordem.`;

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '');
}

function slugify(text: string): string {
  return fold(text).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Songs are filed as `artista--titulo.txt`, so they sort by artist. */
function songFile(title: string, artist?: string): string {
  const parts = [artist, title].filter((part): part is string => !!part);
  return join(SONGS_DIR, `${parts.map(slugify).join('--')}.txt`);
}

/** Title and artist from a song's file name, for headers that leave them out. */
function namesFromFile(file: string): { title: string; artist?: string } {
  const words = (slug: string) => slug.replace(/[-_]+/g, ' ').replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  const [first, second] = basename(file, extname(file)).split('--');
  return second ? { title: words(second), artist: words(first) } : { title: words(first) };
}

async function loadGlobalShapes(): Promise<Record<string, Shape>> {
  if (!existsSync(SHAPES_FILE)) return {};
  const shapes: Record<string, Shape> = {};
  for (const line of (await readFile(SHAPES_FILE, 'utf8')).split('\n')) {
    const content = line.replace(/#.*/, '').trim();
    if (!content) continue;
    const [name, spec] = content.split('=').map((part) => part.trim());
    const shape = spec ? parseShapeSpec(spec) : undefined;
    if (name && shape) shapes[name] = shape;
    else console.warn(`acordes.txt: linha ignorada: ${line}`);
  }
  return shapes;
}

async function songFiles(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  return (await readdir(dir))
    .filter((f) => /\.(txt|cifra)$/i.test(f))
    .sort()
    .map((f) => join(dir, f));
}

async function loadSong(file: string): Promise<Song> {
  const song = parseSong(await readFile(file, 'utf8'));
  const fromName = namesFromFile(file);
  song.title ||= fromName.title;
  song.artist ||= fromName.artist;
  return song;
}

async function buildPdfs(files: string[]): Promise<void> {
  if (!files.length) {
    console.log(`Nenhuma música encontrada em ${relative(process.cwd(), SONGS_DIR) || SONGS_DIR}/`);
    return;
  }
  await mkdir(OUT_DIR, { recursive: true });
  const shapes = await loadGlobalShapes();
  const browser = await launchBrowser();
  try {
    for (const file of files) {
      const song = await loadSong(file);
      const { html, missing } = renderSong(song, shapes);
      const out = join(OUT_DIR, `${basename(file, extname(file))}.pdf`);
      const label = [song.artist, song.title].filter(Boolean).join(' · ');
      const layout = await renderPdf(browser, html, out, label);

      const pages = layout.pages === 1 ? '1 folha' : `${layout.pages} folhas`;
      const cols = layout.cols === 1 ? '1 coluna' : `${layout.cols} colunas`;
      console.log(`✓ ${relative(process.cwd(), out)}  (${pages}, ${cols}, ${layout.fontSize}pt)`);
      if (missing.length) {
        console.log(`  ! sem diagrama para: ${missing.join(', ')} — defina com "acorde: NOME = x32010"`);
      }
    }
  } finally {
    await browser.close();
  }
}

/** Every chord in the songbook, by root and then by name, with how many songs use it. */
async function buildChordSheet(files: string[]): Promise<void> {
  if (!files.length) {
    console.log(`Nenhuma música encontrada em ${relative(process.cwd(), SONGS_DIR) || SONGS_DIR}/`);
    return;
  }
  await mkdir(OUT_DIR, { recursive: true });
  // A shape set for a single song fills a gap; the shapes in acordes.txt win.
  const shapes = await loadGlobalShapes();
  const chords = await chordUses(files, shapes);

  const out = join(OUT_DIR, 'acordes.pdf');
  const browser = await launchBrowser();
  try {
    await printPdf(browser, renderChords(chords), out);
  } finally {
    await browser.close();
  }
  const missing = chords.filter((c) => !c.shapes.length).map((c) => c.name);
  const mine = chords.filter((c) => c.songs).length;
  console.log(
    `✓ ${relative(process.cwd(), out)}  (${chords.length} acordes: ${mine} das suas ${files.length} músicas, ${chords.length - mine} para estudar)`,
  );
  if (missing.length) console.log(`  ! sem diagrama para: ${missing.join(', ')}`);
}

/** Every chord of the given songs plus the common ones, filed for the study sheets. */
async function chordUses(files: string[], shapes: Record<string, Shape>): Promise<ChordUse[]> {
  // Cifra sites write the diminished sign as either ° or º; it is one chord either way.
  const uses = new Map<string, number>();
  const spelling = new Map<string, string>();
  const count = (name: string, songs: number) => {
    const sign = name.replace(/º/g, '°');
    const known = spelling.get(sign) ?? name;
    spelling.set(sign, known);
    uses.set(known, (uses.get(known) ?? 0) + songs);
  };

  for (const file of files) {
    const song = await loadSong(file);
    for (const [name, spec] of Object.entries(song.shapes)) {
      const shape = parseShapeSpec(spec);
      if (shape) shapes[name] ??= shape;
    }
    for (const name of songChords(song)) count(name, 1);
  }
  for (const name of COMMON_CHORDS) if (!spelling.has(name.replace(/º/g, '°'))) count(name, 0);

  // Filed like a chord dictionary: by root note, then from the everyday qualities out.
  const RANKS = ['major', 'minor', '7', 'm7', 'maj7', 'sus4', 'add9', '6', 'sus2', 'dim', 'm7b5'];
  const order = (name: string) => {
    const chord = parseChord(name);
    if (!chord) return `99 ${name}`;
    const root = String(notePitch(chord.root)).padStart(2, '0');
    const rank = RANKS.indexOf(toSuffix(chord.quality) ?? '');
    return `${root} ${String(rank < 0 ? RANKS.length : rank).padStart(2, '0')} ${chord.bass ? 1 : 0} ${name}`;
  };
  return [...uses]
    .sort(([a], [b]) => order(a).localeCompare(order(b)))
    .map(([name, songs]) => ({ name, shapes: shapeOptions(name, shapes, 3), songs }));
}

async function readInput(): Promise<string> {
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString('utf8');
  }
  const readers: [string, string[]][] = [
    // Text only: a screenshot left on the clipboard must not become a song.
    ['wl-paste', ['--no-newline', '--type', 'text']],
    ['xclip', ['-selection', 'clipboard', '-o']],
    ['xsel', ['--clipboard', '--output']],
    ['pbpaste', []],
  ];
  for (const [cmd, args] of readers) {
    try {
      return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      // try the next clipboard tool
    }
  }
  throw new Error('não consegui ler a área de transferência; envie o texto pela entrada padrão');
}

async function ask(questions: string[]): Promise<string[]> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answers: string[] = [];
    for (const question of questions) answers.push((await rl.question(question)).trim());
    return answers;
  } finally {
    rl.close();
  }
}

async function createSong(titleArg: string | undefined, artistArg: string | undefined): Promise<void> {
  const text = (await readInput()).replace(/\r\n?/g, '\n').replace(/^\s*\n|\s+$/g, '');
  if (!text.trim()) throw new Error('o texto da cifra está vazio');

  const key = /^\s*tom:\s*(\S+)/im.exec(text)?.[1];
  const heading = splitHeading(text.replace(/^\s*tom:.*\n?/im, ''));
  let title = titleArg ?? heading.title;
  let artist = artistArg ?? heading.artist;
  if (!title && process.stdin.isTTY) [title, artist] = await ask(['Título: ', 'Artista: ']);
  if (!title) throw new Error('informe o título: cancioneiro nova "Título" ["Artista"]');
  const file = songFile(title, artist);
  const name = relative(process.cwd(), file);
  if (existsSync(file)) {
    const [answer] = process.stdin.isTTY ? await ask([`${name} já existe. Substituir? [s/N] `]) : [''];
    if (!/^s/i.test(answer)) throw new Error(`${name} já existe; nada foi alterado`);
  }
  // A heading that repeats the given title is dropped; anything else might be lyrics.
  const keepsHeading = titleArg !== undefined && fold(titleArg).toLowerCase() !== fold(heading.title ?? '').toLowerCase();
  const body = (keepsHeading ? text.replace(/^\s*tom:.*\n?/im, '') : heading.body).replace(/^\s*\n/, '');
  const hasTabs = body.split('\n').some(isTabLine);
  let tabs = 'não';
  if (hasTabs && process.stdin.isTTY) {
    const [answer] = await ask(['Incluir as tabs? [s/N] ']);
    if (/^s/i.test(answer)) tabs = 'sim';
  }

  await mkdir(SONGS_DIR, { recursive: true });
  const header = [
    '---',
    `titulo: ${title}`,
    `artista: ${artist ?? ''}`,
    `tom: ${key ?? ''}`,
    'capo:',
    'batida:',
    ...(hasTabs ? [`tabs: ${tabs}`] : []),
    '---',
  ];
  await writeFile(file, `${header.join('\n')}\n\n${body}\n`);
  console.log(`+ ${name}`);
  await buildPdfs([file]);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'pdf':
      await buildPdfs(args.length ? args.map((a) => resolve(a)) : await songFiles(SONGS_DIR));
      break;
    case 'acordes':
      await buildChordSheet(args.length ? args.map((a) => resolve(a)) : await songFiles(SONGS_DIR));
      break;
    case 'nova':
      await createSong(args[0], args[1]);
      break;
    default:
      console.log(HELP);
  }
}

main().catch((error: unknown) => {
  console.error(`erro: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
