export type ItemStatus = 'active' | 'dead' | 'risky' | 'unchecked';

export interface Item {
  name: string;
  url: string;
  archive_url?: string;
  description?: string;
  tags: string[];
  status: ItemStatus;
  last_checked?: string;
  note?: string;
}

export interface Category {
  category: string;
  slug: string;
  group: string;
  description?: string;
  items: Item[];
}

export interface OsintFeed {
  generated_at: string;
  groups: string[];
  stats: { categories: number; items: number; dead: number; risky: number };
  categories: Category[];
}

export type NodeKind = 'group' | 'category' | 'item' | 'more';

export interface GraphNode {
  id: string;
  label: string;
  kind: NodeKind;
  group: string;
  status?: ItemStatus;
  url?: string;
  archive_url?: string;
  parentId?: string;
  tags?: string[];
  count?: number;
  // orbital layout for expanded items (pinned around their parent)
  orbitR?: number;
  orbitA?: number;
  // d3-force runtime fields
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  kind: 'group' | 'parent' | 'correlation';
}
