/**
 * fetch-feed.js — RumorMouth's automated Wire + Release ingestion.
 *
 * WHAT THIS DOES:
 *   1. Pulls entries from public entertainment RSS feeds (WIRE_SOURCES) and
 *      licensed press-release feeds (RELEASE_SOURCES).
 *   2. For WIRE_SOURCES: keeps title, a short excerpt (~220 chars, HTML
 *      stripped), source name, the original article URL, and publish date.
 *      Never stores full article text — excerpt + attribution + link only.
 *   3. For RELEASE_SOURCES: PR Newswire licenses its releases for full
 *      republication, so the full body is stored for those specifically.
 *   4. Writes each entry as a Markdown file in content/posts/, matching the
 *      shape of content/posts/sample-wire-item.md.
 *
 * USAGE:
 *   npm install          (already run once during scaffolding)
 *   node fetch-feed.js
 *
 * SCHEDULING: run this on a timer (cron, GitHub Actions on a schedule, or
 * your host's scheduled jobs) — no always-on server required for a static
 * site. Every 30-60 minutes is reasonable for a gossip/news feed.
 *
 * MAINTENANCE NOTE: RSS feed URLs occasionally move or get discontinued.
 * If a source in these lists starts failing, check the outlet's site for
 * an updated feed URL before assuming something's broken on this end.
 */

const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

// ---- Verified public RSS feeds, curated as excerpt + link (type: wire) ----
const WIRE_SOURCES = [
  { name: 'Variety',    url: 'https://variety.com/feed/',                                    category: 'Film & TV' },
  { name: 'TMZ',        url: 'https://www.tmz.com/rss.xml',                                    category: 'Splits & Sparks' },
  { name: 'E! News',    url: 'https://www.eonline.com/syndication/feeds/rssfeeds/topstories.xml', category: 'Red Carpet' },
  { name: 'Us Weekly',  url: 'https://www.usmagazine.com/feed/',                                category: 'Splits & Sparks' },
  { name: 'Rolling Stone', url: 'https://www.rollingstone.com/feed/',                           category: 'Music' },
];

// ---- Licensed press-release wires, republished in full (type: release) ----
const RELEASE_SOURCES = [
  { name: 'PR Newswire — Entertainment & Media',
    url: 'https://www.prnewswire.com/rss/entertainment-media-latest-news/entertainment-media-latest-news-list.rss',
    category: 'Industry' },
];

const EXCERPT_MAX_CHARS = 220;
const OUTPUT_DIR = path.join(__dirname, '..', 'content', 'posts');
const MAX_ITEMS_PER_SOURCE = 5; // keep the demo run small; raise once this is live

// PR Newswire's "Entertainment & Media" category feed includes a lot of
// general business PR (market research reports, law firms, insurance,
// dental practices, etc.) alongside genuine entertainment releases, plus
// the same release repeated in multiple languages. Filter both out below.

// Skip a release if the title matches any of these — general business PR
// that isn't actually entertainment/gossip relevant, even though it came
// through the "Entertainment & Media" feed category.
const RELEASE_BLOCKLIST = [
  /\bmarket (size|share|to reach|research|report)\b/i,
  /\binsurance\b/i,
  /\blaw firm|attorney|dentistry|dental\b/i,
  /\bHelloNation\b/i,
  /\bCEO Confidence|antitrust|shareholder|earnings\b/i,
  /\bInventHelp\b/i,
];

// A quick, dependency-free English check: real English sentences are full
// of short common function words (the, and, of, to...). Non-English text
// (even in a Latin-script language like French or Spanish) won't match
// nearly as many of these, since the specific words are English-only.
const ENGLISH_MARKERS = /\b(the|and|of|to|in|for|is|with|on|by|from|that|will|has)\b/gi;

function looksEnglish(text) {
  const sample = String(text || '').slice(0, 500);
  const wordCount = sample.split(/\s+/).filter(Boolean).length;
  if (wordCount < 8) return true; // too short to judge, don't block it
  const matches = (sample.match(ENGLISH_MARKERS) || []).length;
  return matches / wordCount > 0.03; // English text clears this easily; other languages don't
}

function isOnTopicRelease(item) {
  const title = item.title || '';
  if (RELEASE_BLOCKLIST.some((re) => re.test(title))) return false;
  if (!looksEnglish(title) || !looksEnglish(item.contentSnippet || item.content)) return false;
  return true;
}

function stripHtml(html) {
  return String(html || '').replace(/<[^>]+>/g, '').trim();
}

function toExcerpt(html) {
  const text = stripHtml(html);
  return text.length > EXCERPT_MAX_CHARS
    ? text.slice(0, EXCERPT_MAX_CHARS).trim() + '…'
    : text;
}

function slugify(title) {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

function isoDate(d) {
  return new Date(d || Date.now()).toISOString().slice(0, 10);
}

function yamlEscape(str) {
  return String(str || '').replace(/"/g, '\\"').replace(/\r?\n/g, ' ').trim();
}

function writeWireItem(item, source) {
  const date = isoDate(item.pubDate);
  const filename = `${date}-${slugify(item.title)}.md`;
  const excerpt = toExcerpt(item.contentSnippet || item.content || item.summary);
  const frontmatter = [
    '---',
    `title: "${yamlEscape(item.title)}"`,
    'type: wire',
    `source_name: "${yamlEscape(source.name)}"`,
    `source_url: "${item.link}"`,
    `date: ${date}`,
    `category: "${source.category}"`,
    'tag: "DEVELOPING"',
    `excerpt: "${yamlEscape(excerpt).slice(0, 155)}"`,
    '---',
    '',
    excerpt,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(OUTPUT_DIR, filename), frontmatter);
  return filename;
}

function writeReleaseItem(item, source) {
  const date = isoDate(item.pubDate);
  const filename = `${date}-${slugify(item.title)}.md`;
  const body = stripHtml(item.content || item['content:encoded'] || item.contentSnippet);
  const excerpt = toExcerpt(body);
  const frontmatter = [
    '---',
    `title: "${yamlEscape(item.title)}"`,
    'type: release',
    `source_name: "${yamlEscape(source.name)}"`,
    `source_url: "${item.link}"`,
    `date: ${date}`,
    `category: "${source.category}"`,
    'tag: "PRESS RELEASE"',
    `excerpt: "${yamlEscape(excerpt).slice(0, 155)}"`,
    '---',
    '',
    body,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(OUTPUT_DIR, filename), frontmatter);
  return filename;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const parser = new Parser({ timeout: 15000 });
  let written = 0;
  let failed = [];

  for (const source of WIRE_SOURCES) {
    try {
      const feed = await parser.parseURL(source.url);
      const items = (feed.items || []).slice(0, MAX_ITEMS_PER_SOURCE);
      for (const item of items) {
        const f = writeWireItem(item, source);
        console.log(`  wire   [${source.name}] -> ${f}`);
        written++;
      }
    } catch (err) {
      failed.push({ source: source.name, error: err.message });
    }
  }

  for (const source of RELEASE_SOURCES) {
    try {
      const feed = await parser.parseURL(source.url);
      const items = (feed.items || []).filter(isOnTopicRelease).slice(0, MAX_ITEMS_PER_SOURCE);
      for (const item of items) {
        const f = writeReleaseItem(item, source);
        console.log(`  release[${source.name}] -> ${f}`);
        written++;
      }
    } catch (err) {
      failed.push({ source: source.name, error: err.message });
    }
  }

  console.log(`\nDone. ${written} posts written to content/posts/.`);
  if (failed.length) {
    console.log(`\n${failed.length} source(s) failed (feed may have moved — check the outlet's site):`);
    failed.forEach(f => console.log(`  - ${f.source}: ${f.error}`));
  }
}

main();
