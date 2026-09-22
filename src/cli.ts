#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseShapeSpec, type Shape } from './chords.ts';
import { launchBrowser, renderPdf } from './pdf.ts';
import { renderSong } from './render.ts';
import { parseSong, type Song } from './song.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SONGS_DIR = join(ROOT, 'musicas');
const OUT_DIR = join(ROOT, 'saida');
const SHAPES_FILE = join(ROOT, 'acordes.txt');

const HELP = `cancioneiro — cifras em texto viram folhas A4 para imprimir

Uso:
  cancioneiro pdf [arquivos...]          gera os PDFs (sem arquivos: todas as músicas de musicas/)
  cancioneiro nova "Título" ["Artista"]  cria uma música a partir do texto copiado (ou da entrada padrão)

Os PDFs vão para saida/.`;

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '');
}

function slugify(text: string): string {
  return fold(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function titleFromFile(file: string): { title: string; number?: number } {
  const name = basename(file, extname(file));
  const m = /^(\d+)[-_ ]+(.*)$/.exec(name);
  const words = (m ? m[2] : name).replace(/[-_]+/g, ' ');
  return { title: words.replace(/\b\p{L}/gu, (c) => c.toUpperCase()), number: m ? Number(m[1]) : undefined };
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
  const fromName = titleFromFile(file);
  song.title ||= fromName.title;
  song.number ??= fromName.number;
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
      const label = [song.number && String(song.number).padStart(2, '0'), song.title].filter(Boolean).join(' · ');
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

async function readInput(): Promise<string> {
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString('utf8');
  }
  const readers: [string, string[]][] = [
    ['wl-paste', ['--no-newline']],
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

async function createSong(title: string | undefined, artist: string | undefined): Promise<void> {
  if (!title) throw new Error('informe o título: cancioneiro nova "Título" ["Artista"]');
  const text = (await readInput()).replace(/\r\n?/g, '\n').replace(/^\s*\n|\s+$/g, '');
  if (!text.trim()) throw new Error('o texto da cifra está vazio');

  await mkdir(SONGS_DIR, { recursive: true });
  const numbers = (await songFiles(SONGS_DIR)).map((f) => titleFromFile(f).number ?? 0);
  const number = Math.max(0, ...numbers) + 1;
  const file = join(SONGS_DIR, `${String(number).padStart(2, '0')}-${slugify(title)}.txt`);

  const key = /^\s*tom:\s*(\S+)/im.exec(text)?.[1];
  const header = ['---', `titulo: ${title}`, `artista: ${artist ?? ''}`, `tom: ${key ?? ''}`, 'capo:', 'batida:', '---'];
  const body = text.replace(/^\s*tom:.*\n?/im, '').replace(/^\s*\n/, '');
  await writeFile(file, `${header.join('\n')}\n\n${body}\n`);
  console.log(`+ ${relative(process.cwd(), file)}`);
  await buildPdfs([file]);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'pdf':
      await buildPdfs(args.length ? args.map((a) => resolve(a)) : await songFiles(SONGS_DIR));
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
