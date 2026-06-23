import { z } from 'zod';

/**
 * Single source of truth for the data model.
 * Each file in data/categories/*.yml must satisfy `CategorySchema`.
 * Scripts (validate / build-data / check-links) all import from here.
 */

export const ItemStatus = z.enum(['active', 'dead', 'risky', 'unchecked']);
export type ItemStatus = z.infer<typeof ItemStatus>;

export const TagSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9-]+$/, 'tags must be lowercase kebab-case');

export const ItemSchema = z
  .object({
    name: z.string().min(1),
    url: z.string().url(),
    archive_url: z.string().url().optional(),
    description: z.string().optional(),
    tags: z.array(TagSchema).default([]),
    status: ItemStatus.default('unchecked'),
    last_checked: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD')
      .optional(),
    note: z.string().optional(),
  })
  .strict();
export type Item = z.infer<typeof ItemSchema>;

export const CategorySchema = z
  .object({
    category: z.string().min(1),
    slug: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/, 'slug must be lowercase kebab-case'),
    // graph cluster the category belongs to (drives colour + grouping)
    group: z.string().min(1).default('general'),
    description: z.string().optional(),
    items: z.array(ItemSchema).default([]),
  })
  .strict();
export type Category = z.infer<typeof CategorySchema>;

/** The compiled feed shape consumed by the front-end graph. */
export interface OsintFeed {
  generated_at: string;
  groups: string[];
  stats: { categories: number; items: number; dead: number; risky: number };
  categories: Category[];
}
