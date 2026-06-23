import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, cleanName, inferGroup, parseMarkdown } from './derive.ts';

test('slugify: kebab-cases and strips markdown/badges', () => {
  assert.equal(slugify('Social Media Search'), 'social-media-search');
  assert.equal(slugify('OSINT [docs](http://y) Tools'), 'osint-tools');
  assert.equal(slugify('A/B & C!!'), 'a-b-c');
  assert.equal(slugify('   '), 'category');
});

test('cleanName: trims and drops trailing badge blocks', () => {
  assert.equal(cleanName('Tools   here'), 'Tools here');
  assert.equal(cleanName('Name [![badge](x)](y)'), 'Name');
});

test('inferGroup: routes by keyword, darkweb wins over forum', () => {
  assert.equal(inferGroup('Instagram'), 'socmint');
  assert.equal(inferGroup('Darkweb Forums'), 'darkweb'); // not socmint
  assert.equal(inferGroup('Aircraft Tracking'), 'transport');
  assert.equal(inferGroup('Cryptocurrency Investigation'), 'finance');
  assert.equal(inferGroup('Image Search'), 'media');
  assert.equal(inferGroup('GPT OSINT (AI)'), 'ai');
  assert.equal(inferGroup('Phone Numbers'), 'sigint');
  assert.equal(inferGroup('Something Totally Random'), 'general');
});

test('parseMarkdown: H1 categories + bullet links only', () => {
  const md = [
    '# Social',
    '- [Tool A](https://a.example)',
    '* [Tool B](http://b.example)',
    '## Subsection',
    '- [Tool C](https://c.example)', // attaches to "Social" (H2 ignored as category)
    '# Empty Category',
    'no links here',
  ].join('\n');
  const cats = parseMarkdown(md);
  assert.equal(cats.length, 1); // "Empty Category" dropped (no items)
  assert.equal(cats[0].category, 'Social');
  assert.deepEqual(
    cats[0].items.map((i) => i.url),
    ['https://a.example', 'http://b.example', 'https://c.example'],
  );
});
