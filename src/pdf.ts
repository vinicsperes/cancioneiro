import { chromium, type Browser } from 'playwright-core';

export interface Layout {
  cols: number;
  fontSize: number;
  pages: number;
}

/**
 * In order of readability. The layout with the fewest sheets wins; ties go to the
 * earlier one. Two columns are allowed a few wrapped lines: they break between
 * chords, so every chord stays over its syllable.
 */
const CANDIDATES = [
  { cols: 1, fontSize: 15 },
  { cols: 1, fontSize: 14 },
  { cols: 1, fontSize: 13 },
  { cols: 2, fontSize: 13 },
  { cols: 2, fontSize: 12.5 },
  { cols: 1, fontSize: 12 },
  { cols: 2, fontSize: 12 },
  { cols: 2, fontSize: 11.5 },
  { cols: 2, fontSize: 11 },
  { cols: 1, fontSize: 11 },
];

const MAX_WRAPPED_LINES = 3;

export function launchBrowser(): Promise<Browser> {
  const executablePath = process.env.CHROME_PATH;
  return chromium.launch(executablePath ? { executablePath } : { channel: 'chrome' });
}

/**
 * Runs inside the page. Every sheet is a fixed A4 box; blocks that overflow one
 * sheet move to a continuation sheet.
 */
function fitLayout(args: {
  candidates: { cols: number; fontSize: number }[];
  maxWrapped: number;
  label: string;
}): Layout {
  const root = document.documentElement;
  const pristine = document.body.innerHTML;
  const MAX_PAGES = 12;

  const apply = (cols: number, fontSize: number, split: boolean) => {
    root.style.setProperty('--fs', `${fontSize}pt`);
    root.style.setProperty('--cols', String(cols));
    root.classList.toggle('cols-2', cols === 2);
    root.classList.toggle('split', split);
  };
  const overflows = (body: HTMLElement) =>
    body.scrollHeight > body.clientHeight + 1 || body.scrollWidth > body.clientWidth + 1;
  const wrappedLines = () =>
    [...document.querySelectorAll<HTMLElement>('.body .line:not(.tab)')].filter((line) => {
      const tops = new Set([...line.children].map((c) => Math.round(c.getBoundingClientRect().top)));
      if (tops.size > 1) return true;
      return [...line.querySelectorAll<HTMLElement>('.ly')].some(
        (ly) => ly.getBoundingClientRect().height > parseFloat(getComputedStyle(ly).lineHeight) * 1.5,
      );
    }).length;

  const continuation = (after: HTMLElement): HTMLElement => {
    const page = document.createElement('main');
    page.className = 'page cont';
    const head = document.querySelector('.head')!.cloneNode(true) as HTMLElement;
    head.classList.add('mini');
    const body = document.createElement('section');
    body.className = 'body';
    page.append(head, body);
    after.after(page);
    return page;
  };

  const labelTabs = () => {
    for (const names of document.querySelectorAll<HTMLElement>('.body .tab > .names')) {
      let top = names.getBoundingClientRect().top;
      for (let slice = names.nextElementSibling; slice; slice = slice.nextElementSibling) {
        if (slice.getBoundingClientRect().top <= top + 1) continue;
        slice.before(names.cloneNode(true));
        top = slice.getBoundingClientRect().top;
      }
    }
  };

  const paginate = (): number => {
    document.body.innerHTML = pristine;
    labelTabs();
    let page = document.querySelector<HTMLElement>('.page')!;
    let pages = 1;
    while (pages < MAX_PAGES) {
      const body = page.querySelector<HTMLElement>('.body')!;
      if (!overflows(body)) break;
      const next = continuation(page);
      const nextBody = next.querySelector<HTMLElement>('.body')!;
      while (overflows(body) && body.children.length > 1) nextBody.prepend(body.lastElementChild!);
      if (overflows(body)) {
        // A single block taller than a sheet: carry its last lines over.
        const block = body.firstElementChild as HTMLElement;
        const rest = block.cloneNode(false) as HTMLElement;
        nextBody.prepend(rest);
        while (overflows(body) && block.querySelectorAll(':scope > .line').length > 1) {
          rest.prepend(block.querySelector(':scope > .line:last-child')!);
        }
      }
      page = next;
      pages++;
    }
    return pages;
  };

  let best: { cols: number; fontSize: number; split: boolean; pages: number } | undefined;
  for (const { cols, fontSize } of args.candidates) {
    for (const split of [false, true]) {
      apply(cols, fontSize, split);
      const pages = paginate();
      if (cols === 2 && wrappedLines() > args.maxWrapped) continue;
      if (!best || pages < best.pages) best = { cols, fontSize, split, pages };
    }
    if (best?.pages === 1) break;
  }

  const { cols, fontSize, split } = best ?? { cols: 1, fontSize: 13, split: true };
  apply(cols, fontSize, split);
  const pages = paginate();
  if (pages > 1) {
    document.querySelectorAll('.page').forEach((page, i) => {
      const foot = document.createElement('footer');
      foot.className = 'foot';
      foot.textContent = `${args.label} · ${i + 1}/${pages}`;
      page.append(foot);
    });
  }
  return { cols, fontSize, pages };
}

export async function renderPdf(browser: Browser, html: string, outPath: string, label: string): Promise<Layout> {
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  try {
    await page.emulateMedia({ media: 'print' });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const layout = await page.evaluate(fitLayout, {
      candidates: CANDIDATES,
      maxWrapped: MAX_WRAPPED_LINES,
      label,
    });
    await page.pdf({ path: outPath, preferCSSPageSize: true, printBackground: true });
    return layout;
  } finally {
    await page.close();
  }
}
