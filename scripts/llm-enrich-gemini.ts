import { GoogleGenAI, Type } from '@google/genai';
import { loadCategories, writeCategory } from './lib.ts';
import { TagSchema } from '../data/schema.ts';

/**
 * Free-tier LLM enrichment via Google Gemini (no paid key required).
 * Generates a factual one-line description + 3-6 tags per tool.
 *
 * Get a free key at https://aistudio.google.com/apikey, then:
 *   GEMINI_API_KEY=... npm run data:llm-enrich-gemini
 *
 * - Idempotent + resumable: skips items that already have a description and
 *   writes back to YAML every few items, so you can stop/resume any time
 *   (the free tier has a daily request cap — just re-run tomorrow).
 * - Rate-limited to the free-tier RPM (set RPM, default 14).
 *
 * Env: MODEL (default gemini-2.0-flash), RPM (default 14), LIMIT, SAVE_EVERY (default 25)
 */
const MODEL = process.env.MODEL ?? 'gemini-2.0-flash';
const RPM = Number(process.env.RPM ?? 14);
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;
const SAVE_EVERY = Number(process.env.SAVE_EVERY ?? 25);
const GAP_MS = Math.ceil(60000 / Math.max(1, RPM));

const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
if (!apiKey) {
  console.error('[-] set GEMINI_API_KEY (free at https://aistudio.google.com/apikey)');
  process.exit(1);
}

const SYSTEM = `You write concise, factual metadata for OSINT (open-source intelligence) tools.
Given a tool's name, URL, and category, return:
- description: ONE neutral sentence (max ~18 words) stating what it is or does. No marketing, no "this tool".
- tags: 3 to 6 short lowercase kebab-case tags (e.g. free, paid, api, open-source, account-required).
Base everything only on the given name, URL, and category. Do not invent specifics you cannot infer.`;

const ai = new GoogleGenAI({ apiKey });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const loaded = loadCategories();
const dirty = new Set<string>();
let done = 0;
let failed = 0;

function save() {
  for (const file of dirty) {
    const entry = loaded.find((l) => l.file === file);
    if (entry) writeCategory(file, entry.data);
  }
  dirty.clear();
}

outer: for (const { file, data } of loaded) {
  for (const item of data.items) {
    if (item.description) continue; // idempotent
    if (done + failed >= LIMIT) break outer;

    const t0 = Date.now();
    try {
      const res = await ai.models.generateContent({
        model: MODEL,
        contents: `Name: ${item.name}\nURL: ${item.url}\nCategory: ${data.category} (group: ${data.group})`,
        config: {
          systemInstruction: SYSTEM,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              description: { type: Type.STRING },
              tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['description', 'tags'],
          },
        },
      });
      const parsed = JSON.parse(res.text ?? '{}') as { description?: string; tags?: string[] };
      if (parsed.description) {
        item.description = parsed.description.trim();
        const tags = new Set(item.tags);
        for (const t of parsed.tags ?? []) {
          const norm = t.toLowerCase().trim();
          if (TagSchema.safeParse(norm).success) tags.add(norm);
        }
        item.tags = [...tags].sort();
        dirty.add(file);
        done++;
      } else {
        failed++;
      }
    } catch (err) {
      failed++;
      console.warn(`[!] ${item.name}: ${err instanceof Error ? err.message : err}`);
      // back off on rate-limit / quota errors
      if (String(err).match(/429|quota|rate/i)) {
        save();
        console.error('[-] hit rate/quota limit — progress saved, re-run later.');
        break outer;
      }
    }

    if (done && done % SAVE_EVERY === 0) save();
    if (done % 50 === 0 && done) console.log(`  ...${done} enriched (${failed} failed)`);

    const elapsed = Date.now() - t0;
    if (elapsed < GAP_MS) await sleep(GAP_MS - elapsed);
  }
}

save();
console.log(`[+] gemini enrich: ${done} enriched, ${failed} failed (model ${MODEL})`);
