import { AtlasGraph, GROUP_COLORS } from './graph.ts';
import type { GraphNode, OsintFeed } from './types.ts';

const feedUrl: string = (window as unknown as { __FEED_URL__: string }).__FEED_URL__;

const svg = document.querySelector('svg') as SVGSVGElement;
const searchEl = document.getElementById('search') as HTMLInputElement;
const statsEl = document.getElementById('stats') as HTMLSpanElement;
const chipsEl = document.getElementById('chips') as HTMLDivElement;
const panel = document.getElementById('panel') as HTMLElement;
const panelBody = document.getElementById('panel-body') as HTMLElement;
const panelClose = document.getElementById('panel-close') as HTMLButtonElement;

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

let feedRef: OsintFeed;

function showItem(n: GraphNode): void {
  const tags = (n.tags ?? []).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
  const link = n.url ? `<p><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.url)}</a></p>` : '';
  const status = n.status ? `<p>status: <span class="status ${n.status}">${n.status}</span></p>` : '';
  panelBody.innerHTML =
    `<div class="group">${esc(n.group)} · tool</div>` +
    `<h2>${esc(n.label)}</h2>${link}${status}${tags ? `<p>${tags}</p>` : ''}`;
  panel.classList.add('open');
}

function wireFilter(): void {
  const fi = panelBody.querySelector<HTMLInputElement>('.list-filter');
  const rows = [...panelBody.querySelectorAll<HTMLLIElement>('.row')];
  fi?.addEventListener('input', () => {
    const q = fi.value.trim().toLowerCase();
    for (const li of rows) li.style.display = !q || li.dataset.name!.includes(q) ? '' : 'none';
  });
}

function showGroup(group: string): void {
  const cats = feedRef.categories.filter((c) => c.group === group);
  const total = cats.reduce((n, c) => n + c.items.length, 0);
  const rows = cats
    .map(
      (c) =>
        `<li class="row nav-cat" data-slug="${esc(c.slug)}" data-name="${esc(c.category.toLowerCase())}">` +
        `<a href="#">${esc(c.category)}</a>` +
        `<span class="rowcount">${c.items.length}</span>` +
        `</li>`,
    )
    .join('');
  panelBody.innerHTML =
    `<div class="group">group</div>` +
    `<h2>${esc(group)}</h2>` +
    `<p class="desc">${cats.length} categories · ${total} tools</p>` +
    `<input class="list-filter" type="search" placeholder="filter ${cats.length} categories…" />` +
    `<ul class="list">${rows}</ul>`;
  panelBody.querySelectorAll<HTMLLIElement>('.nav-cat').forEach((li) =>
    li.addEventListener('click', (e) => {
      e.preventDefault();
      showCategoryBySlug(li.dataset.slug!, group);
    }),
  );
  wireFilter();
  panel.classList.add('open');
}

function showCategoryBySlug(slug: string, fromGroup?: string): void {
  const cat = feedRef.categories.find((c) => c.slug === slug);
  if (!cat) return;
  const back = fromGroup
    ? `<button class="back" data-group="${esc(fromGroup)}">‹ ${esc(fromGroup)}</button>`
    : '';
  const rows = cat.items
    .map(
      (it) =>
        `<li class="row" data-name="${esc(it.name.toLowerCase())}">` +
        `<span class="dot ${it.status}"></span>` +
        `<a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.name)}</a>` +
        (it.tags.length ? `<span class="rowtags">${it.tags.map(esc).join(' · ')}</span>` : '') +
        `</li>`,
    )
    .join('');
  panelBody.innerHTML =
    back +
    `<div class="group">${esc(cat.group)} · category</div>` +
    `<h2>${esc(cat.category)}</h2>` +
    (cat.description ? `<p class="desc">${esc(cat.description)}</p>` : '') +
    `<input class="list-filter" type="search" placeholder="filter ${cat.items.length} tools…" />` +
    `<ul class="list">${rows}</ul>`;
  panelBody.querySelector<HTMLButtonElement>('.back')?.addEventListener('click', () => showGroup(cat.group));
  wireFilter();
  panel.classList.add('open');
}

function showPanel(n: GraphNode): void {
  if (n.kind === 'more') { return; }
  if (n.kind === 'group') showGroup(n.group);
  else if (n.kind === 'category') showCategoryBySlug(n.id.replace(/^cat:/, ''), n.group);
  else showItem(n);
}

panelClose.addEventListener('click', () => panel.classList.remove('open'));

async function main(): Promise<void> {
  const res = await fetch(feedUrl);
  if (!res.ok) { statsEl.textContent = 'failed to load data'; return; }
  const feed: OsintFeed = await res.json();
  feedRef = feed;
  statsEl.textContent = `${feed.stats.categories} categories · ${feed.stats.items} tools · ${feed.stats.dead} dead · ${feed.stats.risky} risky`;

  const graph = new AtlasGraph(svg, feed, (n) => { if (n) showPanel(n); });

  let debounce: ReturnType<typeof setTimeout>;
  searchEl.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => graph.search(searchEl.value), 180);
  });

  const active = new Set<string>();
  for (const g of feed.groups) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = g;
    chip.style.borderColor = GROUP_COLORS[g] ?? '#2a3350';
    chip.addEventListener('click', () => {
      if (active.has(g)) { active.delete(g); chip.classList.remove('on'); chip.style.background = ''; }
      else { active.add(g); chip.classList.add('on'); chip.style.background = GROUP_COLORS[g] ?? '#fff'; }
      graph.filterGroups(active);
    });
    chipsEl.appendChild(chip);
  }
}

main();
