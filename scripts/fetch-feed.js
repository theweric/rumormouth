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
const matter = require('gray-matter');

// Media RSS namespace tags (<media:content>, <media:thumbnail>) aren't part
// of the base RSS spec, so rss-parser doesn't pick them up unless told to.
// Standard <enclosure> tags are parsed automatically as item.enclosure.
const PARSER_OPTIONS = {
  timeout: 15000,
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
    ],
  },
};

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

function isLikelyImageUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

// Pulls the image the SOURCE article itself designated for previews — the
// same one that would show up in a social media link-preview card. This
// hotlinks to the source's own image rather than downloading/rehosting it,
// matching how link previews work everywhere (Twitter, Facebook, iMessage,
// Slack all do this too) — it's a citation aid, not a content reproduction.
function extractImageFromFeed(item) {
  if (item.enclosure && isLikelyImageUrl(item.enclosure.url)) {
    return item.enclosure.url;
  }
  if (Array.isArray(item.mediaContent) && item.mediaContent.length) {
    const url = item.mediaContent[0]?.$?.url;
    if (isLikelyImageUrl(url)) return url;
  }
  if (Array.isArray(item.mediaThumbnail) && item.mediaThumbnail.length) {
    const url = item.mediaThumbnail[0]?.$?.url;
    if (isLikelyImageUrl(url)) return url;
  }
  // Fallback: first <img src="..."> found in the raw HTML content, if any.
  const html = item.content || item['content:encoded'] || '';
  const match = String(html).match(/<img[^>]+src=["']([^"']+)["']/i);
  if (match && isLikelyImageUrl(match[1])) return match[1];
  return null;
}

// Many RSS feeds simply don't include image data at all, even when the
// actual article page clearly has a photo — the feed format just wasn't
// built to carry it. Almost every modern site sets an og:image meta tag
// on the article page itself (that's what powers social-share preview
// cards), so as a last resort we fetch the real page and pull that.
async function fetchOgImage(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RumorMouthBot/1.0; +https://rumormouth.com)' },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    const match =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return match && isLikelyImageUrl(match[1]) ? match[1] : null;
  } catch (err) {
    return null; // network hiccup, timeout, or blocked request — fail quietly, no image
  }
}

async function extractImage(item) {
  const feedImage = extractImageFromFeed(item);
  if (feedImage) return feedImage;
  if (item.link) return await fetchOgImage(item.link);
  return null;
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

async function writeWireItem(item, source) {
  const date = isoDate(item.pubDate);
  const filename = `${date}-${slugify(item.title)}.md`;
  const excerpt = toExcerpt(item.contentSnippet || item.content || item.summary);
  const image = await extractImage(item);
  const data = {
    title: item.title,
    type: 'wire',
    source_name: source.name,
    source_url: item.link,
    date,
    category: source.category,
    tag: 'DEVELOPING',
    // Truncate the RAW text first, then let gray-matter handle escaping —
    // truncating an already-escaped string can chop a "\"" pair in half,
    // leaving a dangling backslash that breaks YAML parsing for every post
    // in the build, not just this one. This ordering makes that impossible.
    excerpt: excerpt.slice(0, 155),
  };
  if (image) data.image = image;
  const fileContent = matter.stringify(excerpt + '\n', data);
  fs.writeFileSync(path.join(OUTPUT_DIR, filename), fileContent);
  return filename;
}

async function writeReleaseItem(item, source) {
  const date = isoDate(item.pubDate);
  const filename = `${date}-${slugify(item.title)}.md`;
  const body = stripHtml(item.content || item['content:encoded'] || item.contentSnippet);
  const excerpt = toExcerpt(body);
  const image = await extractImage(item);
  const data = {
    title: item.title,
    type: 'release',
    source_name: source.name,
    source_url: item.link,
    date,
    category: source.category,
    tag: 'PRESS RELEASE',
    excerpt: excerpt.slice(0, 155),
  };
  if (image) data.image = image;
  const fileContent = matter.stringify(body + '\n', data);
  fs.writeFileSync(path.join(OUTPUT_DIR, filename), fileContent);
  return filename;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const parser = new Parser(PARSER_OPTIONS);
  let written = 0;
  let failed = [];

  for (const source of WIRE_SOURCES) {
    try {
      const feed = await parser.parseURL(source.url);
      const items = (feed.items || []).slice(0, MAX_ITEMS_PER_SOURCE);
      for (const item of items) {
        const f = await writeWireItem(item, source);
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
        const f = await writeReleaseItem(item, source);
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

if (require.main === module) {
  main();
}

module.exports = { isOnTopicRelease, looksEnglish, RELEASE_BLOCKLIST, writeWireItem, writeReleaseItem };
