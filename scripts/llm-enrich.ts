import { writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { loadCategories, writeCategory, ROOT } from './lib.ts';
import { TagSchema, type Item } from '../data/schema.ts';

/**
 * One-time LLM enrichment of tool entries via the Batch API (50% cost, async).
 * Generates a factual one-line description + 3-6 tags per tool.
 *
 * - Idempotent: only enriches items lacking a description; safe to re-run.
 * - Resumable: persists the batch id to .llm-enrich-state.json. Re-running
 *   resumes polling/applying instead of resubmitting.
 * - Prompt caching: the shared instruction block is cached across requests.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... npm run data:llm-enrich          # submit (or resume)
 *   LIMIT=50 ANTHROPIC_API_KEY=... npm run data:llm-enrich # small test batch
 *   MODEL=claude-haiku-4-5 ...                             # cheaper model
 */
const MODEL = process.env.MODEL ?? 'claude-opus-4-8';
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;
const STATE = join(ROOT, '.llm-enrich-state.json');

const SYSTEM = `You write concise, factual metadata for OSINT (open-source intelligence) tools and resources.
Given a tool's name, URL, and category, produce:
- description: ONE neutral sentence (max ~18 words) stating what the tool/resource is or does. No marketing, no "this tool". If unsure, describe from the name/URL conservatively.
- tags: 3 to 6 short lowercase kebab-case tags (e.g. free, paid, api, open-source, account-required, search-engine). No spaces.
Base everything only on the given name, URL, and category — do not invent specifics you cannot infer.`;

const FORMAT = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    properties: {
      description: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
    },
    required: ['description', 'tags'],
    additionalProperties: false,
  },
};

interface WorkItem {
  cid: string;
  slug: string;
  index: number;
}

const client = new Anthropic();
const loaded = loadCategories();

// map slug -> loaded entry for writeback
const bySlug = new Map(loaded.map((l) => [l.data.slug, l]));

// ---- resume path: a batch is already in flight ----
if (existsSync(STATE)) {
  const state = JSON.parse(readFileSync(STATE, 'utf-8')) as { batchId: string; work: WorkItem[] };
  const batch = await client.messages.batches.retrieve(state.batchId);
  console.log(`[*] batch ${state.batchId}: ${batch.processing_status}`);
  if (batch.processing_status !== 'ended') {
    console.log(`    counts:`, batch.request_counts);
    console.log('[i] not finished — re-run later to apply results.');
    process.exit(0);
  }
  const work = new Map(state.work.map((w) => [w.cid, w]));
  let applied = 0;
  for await (const res of await client.messages.batches.results(state.batchId)) {
    if (res.result.type !== 'succeeded') continue;
    const w = work.get(res.custom_id);
    if (!w) continue;
    const text = res.result.message.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') continue;
    let parsed: { description?: string; tags?: string[] };
    try {
      parsed = JSON.parse(text.text);
    } catch {
      continue;
    }
    const entry = bySlug.get(w.slug);
    const item = entry?.data.items[w.index] as Item | undefined;
    if (!item || !parsed.description) continue;
    item.description = parsed.description.trim();
    const tags = new Set(item.tags);
    for (const t of parsed.tags ?? []) {
      const norm = t.toLowerCase().trim();
      if (TagSchema.safeParse(norm).success) tags.add(norm);
    }
    item.tags = [...tags].sort();
    applied++;
  }
  for (const { file, data } of loaded) writeCategory(file, data);
  rmSync(STATE);
  console.log(`[+] applied ${applied} enrichments; state cleared.`);
  process.exit(0);
}

// ---- submit path: build and create a new batch ----
const work: WorkItem[] = [];
const requests: Anthropic.Messages.Batches.BatchCreateParams.Request[] = [];
let n = 0;
for (const { data } of loaded) {
  for (let i = 0; i < data.items.length; i++) {
    if (work.length >= LIMIT) break;
    const item = data.items[i];
    if (item.description) continue; // idempotent: already enriched
    const cid = `t${n++}`;
    work.push({ cid, slug: data.slug, index: i });
    requests.push({
      custom_id: cid,
      params: {
        model: MODEL,
        max_tokens: 300,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        output_config: { format: FORMAT },
        messages: [
          {
            role: 'user',
            content: `Name: ${item.name}\nURL: ${item.url}\nCategory: ${data.category} (group: ${data.group})`,
          },
        ],
      },
    });
  }
}

if (!requests.length) {
  console.log('[i] nothing to enrich — every item already has a description.');
  process.exit(0);
}

const batch = await client.messages.batches.create({ requests });
writeFileSync(STATE, JSON.stringify({ batchId: batch.id, work }, null, 2));
console.log(`[+] submitted batch ${batch.id} with ${requests.length} requests (model ${MODEL}).`);
console.log(`    state saved to .llm-enrich-state.json — re-run this command to poll & apply.`);
