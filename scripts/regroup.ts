import { loadCategories, writeCategory } from './lib.ts';
import { inferGroup } from './derive.ts';

/**
 * Re-apply the (improved) group taxonomy to every category. Safe to re-run:
 * only the `group` field changes. Also refreshes the templated description's
 * group name when it was auto-generated.
 */
let changed = 0;
const dist = new Map<string, number>();
for (const { file, data } of loadCategories()) {
  const g = inferGroup(data.category);
  dist.set(g, (dist.get(g) ?? 0) + 1);
  if (g !== data.group) {
    const tmpl = `${data.category} — ${data.group} resources`;
    if (data.description?.startsWith(tmpl)) {
      data.description = data.description.replace(`— ${data.group} resources`, `— ${g} resources`);
    }
    data.group = g;
    writeCategory(file, data);
    changed++;
  }
}
console.log(`[+] regrouped ${changed} categories`);
console.log([...dist.entries()].sort((a, b) => b[1] - a[1]).map(([g, n]) => `${g}:${n}`).join('  '));
