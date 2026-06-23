import Fuse from 'fuse.js';
import { AtlasGraph, GROUP_COLORS, STATUS_RING } from './graph.ts';
import type { GraphNode, Item, OsintFeed } from './types.ts';

const feedUrl: string = (window as unknown as { __FEED_URL__: string }).__FEED_URL__;

const svg = document.querySelector('svg') as SVGSVGElement;
const searchEl = document.getElementById('search') as HTMLInputElement;
const statsEl = document.getElementById('stats') as HTMLSpanElement;
const chipsEl = document.getElementById('chips') as HTMLDivElement;
const statusEl = document.getElementById('statusfilter') as HTMLDivElement;
const corrBtn = document.getElementById('corr') as HTMLButtonElement;
const legendEl = document.getElementById('legend') as HTMLDivElement;
const panel = document.getElementById('panel') as HTMLElement;
const panelBody = document.getElementById('panel-body') as HTMLElement;
const panelClose = document.getElementById('panel-close') as HTMLButtonElement;

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

let feedRef: OsintFeed;
interface IndexedItem extends Item {
  catSlug: string;
  catName: string;
  group: string;
}
let itemFuse: Fuse<IndexedItem>;
const activeStatuses = new Set<string>();

/** Reflect current view in the URL so it can be shared / bookmarked. */
function setUrl(params: Record<string, string | undefined>): void {
  const u = new URL(location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v) u.searchParams.set(k, v);
    else u.searchParams.delete(k);
  }
  history.replaceState(null, '', u);
}

function rowHtml(it: Item, withCat?: string): string {
  return (
    `<li class="row" data-name="${esc((it.name + ' ' + (withCat ?? '')).toLowerCase())}"${withCat ? ` data-slug="${esc((it as IndexedItem).catSlug)}"` : ''}>` +
    `<span class="dot ${it.status}" title="${it.status}"></span>` +
    `<a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.name)}</a>` +
    (it.status === 'dead' && it.archive_url
      ? `<a class="archive" href="${esc(it.archive_url)}" target="_blank" rel="noopener" title="archived snapshot">📦</a>`
      : '') +
    (withCat
      ? `<span class="rowtags">${esc(withCat)}</span>`
      : it.tags.length
        ? `<span class="rowtags">${it.tags.map(esc).join(' · ')}</span>`
        : '') +
    `</li>`
  );
}

function wireFilter(): void {
  const fi = panelBody.querySelector<HTMLInputElement>('.list-filter');
  const rows = [...panelBody.querySelectorAll<HTMLLIElement>('.row')];
  const apply = () => {
    const q = (fi?.value ?? '').trim().toLowerCase();
    for (const li of rows) {
      const stOk =
        activeStatuses.size === 0 ||
        activeStatuses.has(li.querySelector('.dot')?.className.split(' ')[1] ?? '');
      li.style.display = (!q || li.dataset.name!.includes(q)) && stOk ? '' : 'none';
    }
  };
  fi?.addEventListener('input', apply);
  apply();
}

function showItem(n: GraphNode | Item): void {
  const tags = (n.tags ?? []).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
  const url = (n as Item).url ?? (n as GraphNode).url;
  const link = url ? `<p><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a></p>` : '';
  const status = n.status ? `<p>status: <span class="status ${n.status}">${n.status}</span></p>` : '';
  const archive =
    n.status === 'dead' && n.archive_url
      ? `<p><a class="archive" href="${esc(n.archive_url)}" target="_blank" rel="noopener">📦 view archived snapshot</a></p>`
      : '';
  const label = (n as GraphNode).label ?? (n as Item).name;
  const group = (n as GraphNode).group ?? (n as IndexedItem).group ?? '';
  panelBody.innerHTML =
    `<div class="group">${esc(group)} · tool</div>` +
    `<h2>${esc(label)}</h2>${link}${status}${archive}${tags ? `<p>${tags}</p>` : ''}`;
  panel.classList.add('open');
}

function showGroup(group: string): void {
  const cats = feedRef.categories.filter((c) => c.group === group);
  const total = cats.reduce((n, c) => n + c.items.length, 0);
  const rows = cats
    .map(
      (c) =>
        `<li class="row nav-cat" data-slug="${esc(c.slug)}" data-name="${esc(c.category.toLowerCase())}">` +
        `<a href="#">${esc(c.category)}</a><span class="rowcount">${c.items.length}</span></li>`,
    )
    .join('');
  panelBody.innerHTML =
    `<div class="group">group</div><h2>${esc(group)}</h2>` +
    `<p class="desc">${cats.length} categories · ${total} tools</p>` +
    `<input class="list-filter" type="search" placeholder="filter ${cats.length} categories…" aria-label="filter categories" />` +
    `<ul class="list" role="list">${rows}</ul>`;
  panelBody.querySelectorAll<HTMLLIElement>('.nav-cat').forEach((li) =>
    li.addEventListener('click', (e) => {
      e.preventDefault();
      showCategoryBySlug(li.dataset.slug!, group);
    }),
  );
  wireFilter();
  panel.classList.add('open');
  setUrl({ group, cat: undefined, q: undefined });
}

function showCategoryBySlug(slug: string, fromGroup?: string): void {
  const cat = feedRef.categories.find((c) => c.slug === slug);
  if (!cat) return;
  const back = fromGroup
    ? `<button class="back" data-group="${esc(fromGroup)}">‹ ${esc(fromGroup)}</button>`
    : '';
  panelBody.innerHTML =
    back +
    `<div class="group">${esc(cat.group)} · category</div><h2>${esc(cat.category)}</h2>` +
    (cat.description ? `<p class="desc">${esc(cat.description)}</p>` : '') +
    `<input class="list-filter" type="search" placeholder="filter ${cat.items.length} tools…" aria-label="filter tools" />` +
    `<ul class="list" role="list">${cat.items.map((it) => rowHtml(it)).join('')}</ul>`;
  panelBody.querySelector<HTMLButtonElement>('.back')?.addEventListener('click', () => showGroup(cat.group));
  wireFilter();
  panel.classList.add('open');
  setUrl({ cat: slug, group: undefined, q: undefined });
}

function showSearchResults(q: string): void {
  const hits = itemFuse.search(q, { limit: 80 }).map((h) => h.item);
  panelBody.innerHTML =
    `<div class="group">search</div><h2>${hits.length}${hits.length === 80 ? '+' : ''} tools match “${esc(q)}”</h2>` +
    (hits.length
      ? `<ul class="list" role="list">${hits.map((it) => rowHtml(it, it.catName)).join('')}</ul>`
      : `<p class="desc">No tools found.</p>`);
  // clicking a result row's category label jumps to that category
  panelBody.querySelectorAll<HTMLLIElement>('.row').forEach((li) =>
    li.querySelector('.rowtags')?.addEventListener('click', () => {
      if (li.dataset.slug) showCategoryBySlug(li.dataset.slug);
    }),
  );
  panel.classList.add('open');
}

function showPanel(n: GraphNode): void {
  if (n.kind === 'more') return;
  if (n.kind === 'group') showGroup(n.group);
  else if (n.kind === 'category') showCategoryBySlug(n.id.replace(/^cat:/, ''), n.group);
  else showItem(n);
}

panelClose.addEventListener('click', () => {
  panel.classList.remove('open');
  setUrl({ group: undefined, cat: undefined, q: undefined });
});

function buildLegend(): void {
  const groups = feedRef.groups
    .map(
      (g) =>
        `<span class="key"><span class="sw" style="background:${GROUP_COLORS[g] ?? '#adb5bd'}"></span>${esc(g)}</span>`,
    )
    .join('');
  const statuses = (['active', 'dead', 'risky', 'unchecked'] as const)
    .map(
      (s) =>
        `<span class="key"><span class="sw ring" style="border-color:${STATUS_RING[s]}"></span>${s}</span>`,
    )
    .join('');
  legendEl.innerHTML = `<div class="legrow">${groups}</div><div class="legrow muted">node ring = status: ${statuses}</div>`;
}

function buildStatusFilter(graph: AtlasGraph): void {
  for (const s of ['active', 'dead', 'risky', 'unchecked'] as const) {
    const b = document.createElement('button');
    b.className = 'stbtn';
    b.textContent = s;
    b.style.borderColor = STATUS_RING[s];
    b.addEventListener('click', () => {
      if (activeStatuses.has(s)) {
        activeStatuses.delete(s);
        b.classList.remove('on');
      } else {
        activeStatuses.add(s);
        b.classList.add('on');
        b.style.background = STATUS_RING[s];
      }
      if (!b.classList.contains('on')) b.style.background = '';
      graph.filterStatus(activeStatuses);
      setUrl({ status: [...activeStatuses].join(',') || undefined });
    });
    statusEl.appendChild(b);
  }
}

async function main(): Promise<void> {
  const res = await fetch(feedUrl);
  if (!res.ok) {
    statsEl.textContent = 'failed to load data';
    return;
  }
  const feed: OsintFeed = await res.json();
  feedRef = feed;
  statsEl.textContent = `${feed.stats.categories} categories · ${feed.stats.items} tools · ${feed.stats.dead} dead · ${feed.stats.risky} risky`;

  const indexed: IndexedItem[] = feed.categories.flatMap((c) =>
    c.items.map((it) => ({ ...it, catSlug: c.slug, catName: c.category, group: c.group })),
  );
  itemFuse = new Fuse(indexed, { keys: ['name', 'tags', 'catName'], threshold: 0.34, ignoreLocation: true });

  const graph = new AtlasGraph(svg, feed, (n) => {
    if (n) showPanel(n);
  });
  buildLegend();
  buildStatusFilter(graph);

  corrBtn.addEventListener('click', () => {
    const on = corrBtn.getAttribute('aria-pressed') !== 'true';
    corrBtn.setAttribute('aria-pressed', String(on));
    corrBtn.classList.toggle('on', on);
    graph.setCorrelations(on);
    setUrl({ corr: on ? '1' : undefined });
  });

  let debounce: ReturnType<typeof setTimeout>;
  searchEl.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const q = searchEl.value.trim();
      graph.search(q);
      setUrl({ q: q || undefined, group: undefined, cat: undefined });
      if (q) showSearchResults(q);
      else panel.classList.remove('open');
    }, 180);
  });

  const active = new Set<string>();
  for (const g of feed.groups) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = g;
    chip.style.borderColor = GROUP_COLORS[g] ?? '#2a3350';
    chip.addEventListener('click', () => {
      if (active.has(g)) {
        active.delete(g);
        chip.classList.remove('on');
        chip.style.background = '';
      } else {
        active.add(g);
        chip.classList.add('on');
        chip.style.background = GROUP_COLORS[g] ?? '#fff';
      }
      graph.filterGroups(active);
    });
    chipsEl.appendChild(chip);
  }

  // restore view from URL (?q= / ?group= / ?cat= / ?status=)
  const p = new URL(location.href).searchParams;
  const st = p.get('status');
  if (st)
    for (const s of st.split(',')) {
      activeStatuses.add(s);
      statusEl.querySelectorAll<HTMLButtonElement>('.stbtn').forEach((b) => {
        if (b.textContent === s) {
          b.classList.add('on');
          b.style.background = STATUS_RING[s as keyof typeof STATUS_RING] ?? '';
        }
      });
    }
  if (activeStatuses.size) graph.filterStatus(activeStatuses);
  if (p.get('corr') === '1') {
    corrBtn.setAttribute('aria-pressed', 'true');
    corrBtn.classList.add('on');
    graph.setCorrelations(true);
  }
  const q = p.get('q');
  const cat = p.get('cat');
  const grp = p.get('group');
  if (q) {
    searchEl.value = q;
    graph.search(q);
    showSearchResults(q);
  } else if (cat) showCategoryBySlug(cat);
  else if (grp) showGroup(grp);
}

main();
