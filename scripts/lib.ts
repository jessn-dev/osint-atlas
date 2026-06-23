import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { CategorySchema, type Category } from '../data/schema.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, '..');
export const CATEGORIES_DIR = join(ROOT, 'data', 'categories');

export interface LoadedCategory {
  file: string;
  data: Category;
}

/** Read and validate every data/categories/*.yml. Throws on first invalid file. */
export function loadCategories(): LoadedCategory[] {
  const files = readdirSync(CATEGORIES_DIR)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .sort();

  const seenSlugs = new Set<string>();
  const out: LoadedCategory[] = [];

  for (const file of files) {
    const raw = readFileSync(join(CATEGORIES_DIR, file), 'utf-8');
    const parsed = yaml.load(raw);
    const result = CategorySchema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('\n');
      throw new Error(`Invalid category file ${file}:\n${issues}`);
    }
    if (seenSlugs.has(result.data.slug)) {
      throw new Error(`Duplicate slug "${result.data.slug}" in ${file}`);
    }
    seenSlugs.add(result.data.slug);
    out.push({ file, data: result.data });
  }
  return out;
}

/** Serialize a category back to YAML (used by migrate + check-links writeback). */
export function writeCategory(file: string, data: Category): void {
  const body = yaml.dump(data, { lineWidth: 100, noRefs: true, sortKeys: false });
  writeFileSync(join(CATEGORIES_DIR, file), body, 'utf-8');
}
