import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

/**
 * RSS Feed node — fetches and parses RSS/Atom feeds.
 * Uses native fetch + simple XML parsing without external dependencies.
 */
export const RSSFeedNode: INodeType = {
  definition: {
    displayName: 'RSS Feed',
    name: 'sibercron.rssFeed',
    icon: 'Rss',
    color: '#F97316',
    group: 'data',
    version: 1,
    description: 'Fetch and parse RSS/Atom feeds',
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        name: 'feedUrl',
        displayName: 'Feed URL',
        type: 'string',
        default: '',
        required: true,
        description: 'URL of the RSS or Atom feed',
        placeholder: 'https://example.com/feed.xml',
      },
      {
        name: 'maxItems',
        displayName: 'Max Items',
        type: 'number',
        default: 10,
        description: 'Maximum number of items to return (0 for all)',
      },
      {
        name: 'includeContent',
        displayName: 'Include Content',
        type: 'boolean',
        default: true,
        description: 'Include the full content/description of each item',
      },
      {
        name: 'timeout',
        displayName: 'Timeout (ms)',
        type: 'number',
        default: 15000,
        description: 'Request timeout in milliseconds',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const feedUrl = context.getParameter<string>('feedUrl');
    const maxItems = context.getParameter<number>('maxItems') ?? 10;
    const includeContent = context.getParameter<boolean>('includeContent') ?? true;
    const timeout = context.getParameter<number>('timeout') ?? 15000;

    context.helpers.log(`RSS: fetching ${feedUrl}`);

    const xml = await context.helpers.httpRequest({
      url: feedUrl,
      method: 'GET',
      timeout,
    }) as string;

    if (typeof xml !== 'string') {
      throw new Error('Feed response is not valid XML text');
    }

    // Parse RSS/Atom feed using regex-based extraction (no external XML parser needed)
    const items = parseFeed(xml, includeContent);
    const limited = maxItems > 0 ? items.slice(0, maxItems) : items;

    context.helpers.log(`RSS: parsed ${limited.length} items from feed`);

    if (limited.length === 0) {
      return [{ json: { feedUrl, itemCount: 0, items: [] } }];
    }

    return limited.map((item, index) => ({
      json: {
        ...item,
        _feedUrl: feedUrl,
        _itemIndex: index,
        _totalItems: limited.length,
      },
    }));
  },
};

interface FeedItem {
  title: string;
  link: string;
  description: string;
  content: string;
  pubDate: string;
  author: string;
  guid: string;
  categories: string[];
}

function parseFeed(xml: string, includeContent: boolean): FeedItem[] {
  const items: FeedItem[] = [];

  // Detect if Atom or RSS
  const isAtom = xml.includes('<feed') && xml.includes('xmlns="http://www.w3.org/2005/Atom"');

  if (isAtom) {
    // Parse Atom entries
    const entries = matchAll(xml, /<entry>([\s\S]*?)<\/entry>/g);
    for (const entry of entries) {
      items.push({
        title: extractTag(entry, 'title'),
        link: extractAtomLink(entry),
        description: extractTag(entry, 'summary'),
        content: includeContent ? extractTag(entry, 'content') : '',
        pubDate: extractTag(entry, 'published') || extractTag(entry, 'updated'),
        author: extractTag(entry, 'name'),
        guid: extractTag(entry, 'id'),
        categories: matchAll(entry, /<category[^>]*term="([^"]*)"[^>]*\/?>/g),
      });
    }
  } else {
    // Parse RSS items
    const rssItems = matchAll(xml, /<item>([\s\S]*?)<\/item>/g);
    for (const item of rssItems) {
      items.push({
        title: extractTag(item, 'title'),
        link: extractTag(item, 'link'),
        description: extractTag(item, 'description'),
        content: includeContent ? (extractTag(item, 'content:encoded') || extractTag(item, 'description')) : '',
        pubDate: extractTag(item, 'pubDate') || extractTag(item, 'dc:date'),
        author: extractTag(item, 'author') || extractTag(item, 'dc:creator'),
        guid: extractTag(item, 'guid'),
        categories: matchAll(item, /<category[^>]*>([\s\S]*?)<\/category>/g),
      });
    }
  }

  return items;
}

function extractTag(xml: string, tag: string): string {
  // Try CDATA first
  const cdataMatch = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i').exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();

  // Try regular tag
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(xml);
  if (match) return decodeXmlEntities(match[1].trim());

  return '';
}

function extractAtomLink(xml: string): string {
  // Atom links: <link href="..." rel="alternate" />
  const altMatch = /<link[^>]*rel="alternate"[^>]*href="([^"]*)"[^>]*\/?>/i.exec(xml);
  if (altMatch) return altMatch[1];

  const hrefMatch = /<link[^>]*href="([^"]*)"[^>]*\/?>/i.exec(xml);
  return hrefMatch?.[1] ?? '';
}

function matchAll(text: string, regex: RegExp): string[] {
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    results.push(match[1]);
  }
  return results;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}
