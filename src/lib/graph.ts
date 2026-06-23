import * as d3 from 'd3';
import Fuse from 'fuse.js';
import type { Category, GraphLink, GraphNode, OsintFeed, Item } from './types.ts';

const GROUP_COLORS: Record<string, string> = {
  socmint: '#ff5d8f',
  sigint: '#ffd166',
  geoint: '#06d6a0',
  breach: '#ef476f',
  web: '#118ab2',
  darkweb: '#8338ec',
  people: '#fb8500',
  threat: '#e63946',
  reference: '#8ecae6',
  general: '#adb5bd',
};
const STATUS_RING: Record<string, string> = {
  active: '#3ddc97',
  dead: '#6c757d',
  risky: '#ff3b3b',
  unchecked: '#cbd5e1',
};
const color = (g: string) => GROUP_COLORS[g] ?? GROUP_COLORS.general;

interface SearchHit {
  type: 'category' | 'item';
  category: Category;
  item?: Item;
}

export class AtlasGraph {
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private root: d3.Selection<SVGGElement, unknown, null, undefined>;
  private linkLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
  private corrLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
  private nodeLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
  private sim: d3.Simulation<GraphNode, GraphLink>;
  private nodes: GraphNode[] = [];
  private links: GraphLink[] = [];
  private expanded = new Set<string>();
  private offsets = new Map<string, number>(); // catId -> items revealed so far
  private byId = new Map<string, GraphNode>();
  private corrPairs: [string, string][] = [];
  private corrLinks: { a: string; b: string }[] = [];
  private showCorr = false;
  private static readonly BATCH = 16;
  private static readonly PER_RING = 14;
  private feed: OsintFeed;
  private fuse: Fuse<SearchHit>;
  private onSelect: (n: GraphNode | null) => void;

  constructor(svgEl: SVGSVGElement, feed: OsintFeed, onSelect: (n: GraphNode | null) => void) {
    this.feed = feed;
    this.onSelect = onSelect;
    this.svg = d3.select(svgEl);
    this.root = this.svg.append('g');
    this.linkLayer = this.root.append('g').attr('class', 'links');
    this.corrLayer = this.root.append('g').attr('class', 'correlations');
    this.nodeLayer = this.root.append('g').attr('class', 'nodes');

    this.svg.call(
      d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.15, 6])
        .on('zoom', (e) => this.root.attr('transform', e.transform.toString())),
    );

    this.sim = d3
      .forceSimulation<GraphNode, GraphLink>()
      .force(
        'link',
        d3
          .forceLink<GraphNode, GraphLink>()
          .id((d) => d.id)
          .distance((l) => (l.kind === 'group' ? 160 : 60))
          .strength(0.6),
      )
      .force(
        'charge',
        d3.forceManyBody().strength((d) => ((d as GraphNode).kind === 'item' ? -40 : -260)),
      )
      .force(
        'collide',
        d3.forceCollide<GraphNode>().radius((d) => this.radius(d) + 6),
      )
      .force('x', d3.forceX<GraphNode>((d) => this.clusterX(d.group)).strength(0.05))
      .force('y', d3.forceY<GraphNode>(0).strength(0.04))
      .on('tick', () => this.tick());

    const hits: SearchHit[] = [];
    for (const c of feed.categories) {
      hits.push({ type: 'category', category: c });
      for (const it of c.items) hits.push({ type: 'item', category: c, item: it });
    }
    this.fuse = new Fuse(hits, {
      keys: ['category.category', 'item.name', 'item.tags', 'category.group'],
      threshold: 0.34,
      ignoreLocation: true,
    });

    this.corrPairs = computeCorrelations(feed);
    this.buildBase();
  }

  /** Toggle pivot links between categories that share a tool URL. */
  setCorrelations(on: boolean): void {
    this.showCorr = on;
    this.refreshCorrelations();
  }

  private refreshCorrelations(): void {
    this.corrLinks = this.showCorr
      ? this.corrPairs
          .filter(([a, b]) => this.byId.has(`cat:${a}`) && this.byId.has(`cat:${b}`))
          .map(([a, b]) => ({ a, b }))
      : [];
    const sel = this.corrLayer
      .selectAll<SVGLineElement, { a: string; b: string }>('line')
      .data(this.corrLinks, (d) => `${d.a}~${d.b}`);
    sel.exit().remove();
    sel.enter().append('line').attr('class', 'link correlation');
    this.tick();
  }

  private radius(d: GraphNode): number {
    if (d.kind === 'group') return 26;
    if (d.kind === 'category') return 9 + Math.min(10, Math.sqrt(d.count ?? 1));
    if (d.kind === 'more') return 8;
    return 5;
  }
  private clusterX(group: string): number {
    const gs = this.feed.groups;
    const i = Math.max(0, gs.indexOf(group));
    const span = 1400;
    return (i / Math.max(1, gs.length - 1)) * span - span / 2;
  }

  /** Progressive disclosure: start with only the group hubs. */
  private buildBase(): void {
    this.nodes = [];
    this.links = [];
    this.expanded.clear();
    this.offsets.clear();
    for (const g of this.feed.groups) {
      this.nodes.push({ id: `group:${g}`, label: g, kind: 'group', group: g, count: this.groupCount(g) });
    }
    this.restart();
  }

  private groupCount(group: string): number {
    return this.feed.categories.filter((c) => c.group === group).length;
  }

  private toggle(parentId: string): void {
    if (this.expanded.has(parentId)) this.collapse(parentId);
    else this.expand(parentId);
  }

  /** Remove a node's descendants (recursively) and reset its expand state. */
  private collapse(parentId: string): void {
    const remove = new Set<string>();
    const walk = (pid: string) => {
      for (const n of this.nodes)
        if (n.parentId === pid && !remove.has(n.id)) {
          remove.add(n.id);
          walk(n.id);
        }
    };
    walk(parentId);
    this.nodes = this.nodes.filter((n) => !remove.has(n.id));
    this.links = this.links.filter((l) => !remove.has(idOf(l.target)));
    for (const id of remove) {
      this.expanded.delete(id);
      this.offsets.delete(id);
    }
    this.expanded.delete(parentId);
    this.offsets.delete(parentId);
    this.restart();
  }

  /** Children of a node: group -> its categories, category -> its items. */
  private childrenOf(parent: GraphNode): GraphNode[] {
    if (parent.kind === 'group') {
      return this.feed.categories
        .filter((c) => c.group === parent.group)
        .map((c) => ({
          id: `cat:${c.slug}`,
          label: c.category,
          kind: 'category',
          group: c.group,
          count: c.items.length,
        }));
    }
    if (parent.kind === 'category') {
      const slug = parent.id.replace(/^cat:/, '');
      const cat = this.feed.categories.find((c) => c.slug === slug);
      if (!cat) return [];
      return cat.items.map((it, i) => ({
        id: `item:${slug}:${i}`,
        label: it.name,
        kind: 'item',
        group: cat.group,
        status: it.status,
        url: it.url,
        archive_url: it.archive_url,
        tags: it.tags,
      }));
    }
    return [];
  }

  /** Reveal the next batch of a node's children on orbital rings around it. */
  private expand(parentId: string): void {
    const parent = this.byId.get(parentId);
    if (!parent) return;
    const moreId = `more:${parentId}`;
    this.nodes = this.nodes.filter((n) => n.id !== moreId);
    this.links = this.links.filter((l) => idOf(l.target) !== moreId);

    const kids = this.childrenOf(parent);
    const start = this.offsets.get(parentId) ?? 0;
    const end = Math.min(start + AtlasGraph.BATCH, kids.length);
    const linkKind: GraphLink['kind'] = parent.kind === 'group' ? 'group' : 'parent';
    for (let i = start; i < end; i++) {
      const { r, a } = this.orbit(i);
      this.nodes.push({ ...kids[i], parentId, orbitR: r, orbitA: a });
      this.links.push({ source: parentId, target: kids[i].id, kind: linkKind });
    }
    this.offsets.set(parentId, end);

    if (end < kids.length) {
      const { r, a } = this.orbit(end);
      this.nodes.push({
        id: moreId,
        label: `+${kids.length - end} more`,
        kind: 'more',
        group: parent.group,
        parentId,
        orbitR: r,
        orbitA: a,
      });
      this.links.push({ source: parentId, target: moreId, kind: 'parent' });
    }
    this.expanded.add(parentId);
    this.restart();
  }

  /** Polar position for the i-th child: fills concentric rings, no overlap. */
  private orbit(i: number): { r: number; a: number } {
    const ring = Math.floor(i / AtlasGraph.PER_RING);
    const inRing = i % AtlasGraph.PER_RING;
    return {
      r: 78 + ring * 48,
      a: (inRing / AtlasGraph.PER_RING) * Math.PI * 2 + ring * 0.5,
    };
  }

  private restart(): void {
    const link = this.linkLayer
      .selectAll<SVGLineElement, GraphLink>('line')
      .data(this.links, (d) => `${idOf(d.source)}->${idOf(d.target)}`);
    link.exit().remove();
    link
      .enter()
      .append('line')
      .attr('class', (d) => `link ${d.kind}`);

    const node = this.nodeLayer.selectAll<SVGGElement, GraphNode>('g.node').data(this.nodes, (d) => d.id);
    node.exit().remove();
    const enter = node
      .enter()
      .append('g')
      .attr('class', (d) => `node ${d.kind}`);
    enter
      .append('circle')
      .attr('r', (d) => this.radius(d))
      .attr('fill', (d) => color(d.group))
      .attr('stroke', (d) => (d.status ? STATUS_RING[d.status] : '#0b0f1a'))
      .attr('stroke-width', (d) => (d.kind === 'item' ? 2.5 : 1.5));
    enter
      .append('text')
      .attr('dy', (d) => -this.radius(d) - 4)
      .attr('text-anchor', 'middle')
      .text((d) => (d.label.length > 28 ? d.label.slice(0, 27) + '…' : d.label));
    enter.call(this.drag());
    enter.on('click', (e, d) => {
      e.stopPropagation();
      if (d.kind === 'more') {
        this.expand(d.parentId!);
        return;
      }
      this.onSelect(d);
      if (d.kind === 'group' || d.kind === 'category') this.toggle(d.id);
    });
    enter.on('dblclick', (_e, d) => {
      if (d.url) window.open(d.url, '_blank', 'noopener');
    });

    this.byId = new Map(this.nodes.map((n) => [n.id, n]));
    this.sim.nodes(this.nodes);
    (this.sim.force('link') as d3.ForceLink<GraphNode, GraphLink>).links(this.links);
    this.sim.alpha(0.8).restart();
    this.refreshCorrelations();
  }

  private tick(): void {
    // pin expanded items/more nodes onto their parent's orbital rings so they
    // never pile up or drift over each other
    for (const n of this.nodes) {
      if ((n.kind === 'item' || n.kind === 'more') && n.parentId && n.orbitR != null && n.fx == null) {
        const p = this.byId.get(n.parentId);
        if (p) {
          n.x = (p.x ?? 0) + Math.cos(n.orbitA!) * n.orbitR;
          n.y = (p.y ?? 0) + Math.sin(n.orbitA!) * n.orbitR;
        }
      }
    }
    this.linkLayer
      .selectAll<SVGLineElement, GraphLink>('line')
      .attr('x1', (d) => (d.source as GraphNode).x ?? 0)
      .attr('y1', (d) => (d.source as GraphNode).y ?? 0)
      .attr('x2', (d) => (d.target as GraphNode).x ?? 0)
      .attr('y2', (d) => (d.target as GraphNode).y ?? 0);
    this.nodeLayer
      .selectAll<SVGGElement, GraphNode>('g.node')
      .attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    if (this.corrLinks.length) {
      this.corrLayer
        .selectAll<SVGLineElement, { a: string; b: string }>('line')
        .attr('x1', (d) => this.byId.get(`cat:${d.a}`)?.x ?? 0)
        .attr('y1', (d) => this.byId.get(`cat:${d.a}`)?.y ?? 0)
        .attr('x2', (d) => this.byId.get(`cat:${d.b}`)?.x ?? 0)
        .attr('y2', (d) => this.byId.get(`cat:${d.b}`)?.y ?? 0);
    }
  }

  private drag() {
    return d3
      .drag<SVGGElement, GraphNode>()
      .on('start', (e, d) => {
        if (!e.active) this.sim.alphaTarget(0.2).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (e, d) => {
        d.fx = e.x;
        d.fy = e.y;
      })
      .on('end', (e, d) => {
        if (!e.active) this.sim.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
  }

  /** Filter base graph to search hits (categories). Empty query = full reset. */
  search(query: string): void {
    const q = query.trim();
    if (!q) {
      this.buildBase();
      return;
    }
    const slugs = new Set<string>();
    for (const r of this.fuse.search(q)) slugs.add(r.item.category.slug);
    const groups = new Set<string>();
    this.nodes = [];
    this.links = [];
    this.expanded.clear();
    for (const c of this.feed.categories) {
      if (!slugs.has(c.slug)) continue;
      groups.add(c.group);
      this.nodes.push({
        id: `cat:${c.slug}`,
        label: c.category,
        kind: 'category',
        group: c.group,
        count: c.items.length,
        parentId: `group:${c.group}`,
      });
    }
    for (const g of groups) {
      this.nodes.unshift({ id: `group:${g}`, label: g, kind: 'group', group: g });
      for (const c of this.feed.categories)
        if (c.group === g && slugs.has(c.slug))
          this.links.push({ source: `group:${g}`, target: `cat:${c.slug}`, kind: 'group' });
    }
    this.restart();
  }

  private activeGroups = new Set<string>();
  private activeStatuses = new Set<string>();

  filterGroups(active: Set<string>): void {
    this.activeGroups = new Set(active);
    this.applyFilters();
  }

  filterStatus(active: Set<string>): void {
    this.activeStatuses = new Set(active);
    this.applyFilters();
  }

  private visible(d: GraphNode): boolean {
    if (this.activeGroups.size && !this.activeGroups.has(d.group)) return false;
    // status filter only constrains item nodes (hubs always shown for context)
    if (this.activeStatuses.size && d.kind === 'item' && (!d.status || !this.activeStatuses.has(d.status)))
      return false;
    return true;
  }

  private applyFilters(): void {
    this.nodeLayer
      .selectAll<SVGGElement, GraphNode>('g.node')
      .style('display', (d) => (this.visible(d) ? null : 'none'));
    this.linkLayer
      .selectAll<SVGLineElement, GraphLink>('line')
      .style('display', (d) => (this.visible(d.target as GraphNode) ? null : 'none'));
  }
}

function idOf(x: string | GraphNode): string {
  return typeof x === 'string' ? x : x.id;
}

/** Category-slug pairs that share at least one tool URL (pivot links). */
function computeCorrelations(feed: OsintFeed): [string, string][] {
  const urlToCats = new Map<string, Set<string>>();
  for (const c of feed.categories) {
    for (const it of c.items) {
      const k = it.url.trim().toLowerCase().replace(/\/+$/, '');
      let set = urlToCats.get(k);
      if (!set) urlToCats.set(k, (set = new Set()));
      set.add(c.slug);
    }
  }
  const pairs = new Set<string>();
  for (const cats of urlToCats.values()) {
    if (cats.size < 2) continue;
    const arr = [...cats].sort();
    for (let i = 0; i < arr.length; i++)
      for (let j = i + 1; j < arr.length; j++) pairs.add(`${arr[i]}|${arr[j]}`);
  }
  return [...pairs].map((k) => k.split('|') as [string, string]);
}

export { GROUP_COLORS, STATUS_RING };
