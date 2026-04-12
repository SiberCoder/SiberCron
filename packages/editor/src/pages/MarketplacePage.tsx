import { useState, useMemo, useEffect } from 'react';
import {
  Package,
  Search,
  Star,
  Download,
  ExternalLink,
  CheckCircle2,
  Brain,
  Zap,
  Database,
  MessageSquare,
  Globe,
  Filter,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import clsx from 'clsx';
import { useNodeRegistryStore } from '../store/nodeRegistryStore';
import { toast } from '../store/toastStore';
import { useTranslation } from '../i18n';

/* ── Types ─────────────────────────────────────────────────────────────── */

interface CommunityNode {
  id: string;
  name: string;
  displayName: string;
  description: string;
  author: string;
  version: string;
  downloads: number;
  stars: number;
  group: string;
  icon: string;
  tags: string[];
  npmPackage: string;
  verified: boolean;
  featured?: boolean;
}

/* ── npm registry fetcher ─────────────────────────────────────────────── */

interface NpmSearchResult {
  objects: Array<{
    package: {
      name: string;
      version: string;
      description: string;
      author?: { name: string };
      keywords?: string[];
      links?: { npm?: string };
    };
    score: { final: number; detail: { popularity: number } };
    downloads?: { monthly: number };
  }>;
  total: number;
}

async function fetchNpmPackages(): Promise<Partial<CommunityNode>[]> {
  try {
    const url = 'https://registry.npmjs.org/-/v1/search?text=sibercron-node&size=50&quality=0.5&popularity=0.7';
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = (await res.json()) as NpmSearchResult;
    return data.objects.map((obj) => {
      const pkg = obj.package;
      const rawName = pkg.name.replace(/^(?:@[^/]+\/)?sibercron-node-/, '');
      return {
        id: pkg.name,
        name: rawName,
        displayName: rawName.charAt(0).toUpperCase() + rawName.slice(1),
        description: pkg.description ?? '',
        author: pkg.author?.name ?? 'community',
        version: pkg.version,
        downloads: Math.round((obj.score.detail.popularity ?? 0) * 10000),
        stars: 0,
        group: 'core',
        icon: 'Package',
        tags: pkg.keywords?.slice(0, 5) ?? [],
        npmPackage: pkg.name,
        verified: false,
        featured: false,
      };
    });
  } catch {
    return [];
  }
}

/* ── Hardcoded community catalog (seed data) ────────────────────────────── */

const COMMUNITY_NODES: CommunityNode[] = [
  {
    id: 'sibercron-node-stripe',
    name: 'stripe',
    displayName: 'Stripe',
    description: 'Stripe Payments API entegrasyonu. Ödeme oluşturma, müşteri yönetimi, webhook tetikleyicileri.',
    author: 'sibercron-community',
    version: '1.2.0',
    downloads: 4821,
    stars: 87,
    group: 'data',
    icon: 'CreditCard',
    tags: ['payment', 'stripe', 'billing', 'webhook'],
    npmPackage: 'sibercron-node-stripe',
    verified: true,
    featured: true,
  },
  {
    id: 'sibercron-node-openai',
    name: 'openai',
    displayName: 'OpenAI Advanced',
    description: 'GPT-4o, DALL-E 3, Whisper, TTS, Embeddings API. Fine-tuning, batch API desteği.',
    author: 'sibercron-community',
    version: '2.0.1',
    downloads: 12450,
    stars: 234,
    group: 'ai',
    icon: 'Brain',
    tags: ['ai', 'gpt', 'embeddings', 'dalle', 'whisper'],
    npmPackage: 'sibercron-node-openai',
    verified: true,
    featured: true,
  },
  {
    id: 'sibercron-node-mongodb',
    name: 'mongodb',
    displayName: 'MongoDB',
    description: 'MongoDB Atlas & self-hosted. find/insert/update/delete/aggregate, Atlas Search, change streams.',
    author: 'sibercron-community',
    version: '1.5.3',
    downloads: 7823,
    stars: 145,
    group: 'data',
    icon: 'Database',
    tags: ['mongodb', 'nosql', 'database', 'atlas'],
    npmPackage: 'sibercron-node-mongodb',
    verified: true,
  },
  {
    id: 'sibercron-node-linear',
    name: 'linear',
    displayName: 'Linear',
    description: 'Linear issue tracker entegrasyonu. Issue/cycle/project CRUD, GraphQL API, webhook tetikleyicileri.',
    author: 'sibercron-community',
    version: '0.9.2',
    downloads: 2341,
    stars: 56,
    group: 'data',
    icon: 'GitPullRequest',
    tags: ['linear', 'issue-tracker', 'project-management'],
    npmPackage: 'sibercron-node-linear',
    verified: false,
  },
  {
    id: 'sibercron-node-resend',
    name: 'resend',
    displayName: 'Resend Email',
    description: 'Resend ile modern email gönderme. React Email şablonları, domain yönetimi, teslim analitikleri.',
    author: 'sibercron-community',
    version: '1.1.0',
    downloads: 3560,
    stars: 72,
    group: 'messaging',
    icon: 'Mail',
    tags: ['email', 'resend', 'transactional'],
    npmPackage: 'sibercron-node-resend',
    verified: true,
  },
  {
    id: 'sibercron-node-twilio',
    name: 'twilio',
    displayName: 'Twilio',
    description: 'SMS, WhatsApp, Voice çağrıları. Twilio Verify OTP, Conversations API, Flex.',
    author: 'sibercron-community',
    version: '1.3.1',
    downloads: 5102,
    stars: 98,
    group: 'messaging',
    icon: 'Phone',
    tags: ['sms', 'whatsapp', 'voice', 'twilio', 'otp'],
    npmPackage: 'sibercron-node-twilio',
    verified: true,
  },
  {
    id: 'sibercron-node-supabase',
    name: 'supabase',
    displayName: 'Supabase',
    description: 'Supabase Database, Auth, Storage, Realtime entegrasyonu. PostgREST queries, RPC çağrıları.',
    author: 'sibercron-community',
    version: '1.0.0',
    downloads: 6789,
    stars: 167,
    group: 'data',
    icon: 'Database',
    tags: ['supabase', 'postgres', 'auth', 'storage'],
    npmPackage: 'sibercron-node-supabase',
    verified: true,
    featured: true,
  },
  {
    id: 'sibercron-node-openweather',
    name: 'openweather',
    displayName: 'OpenWeather',
    description: 'Gerçek zamanlı hava durumu, 5/16 günlük tahmin, hava kalitesi, UV endeksi.',
    author: 'sibercron-community',
    version: '0.8.0',
    downloads: 1890,
    stars: 31,
    group: 'core',
    icon: 'Cloud',
    tags: ['weather', 'forecast', 'api'],
    npmPackage: 'sibercron-node-openweather',
    verified: false,
  },
  {
    id: 'sibercron-node-browserless',
    name: 'browserless',
    displayName: 'Browserless',
    description: 'Headless Chrome otomasyon. Puppeteer/Playwright API, screenshot, PDF, web scraping, form doldurma.',
    author: 'sibercron-community',
    version: '1.4.2',
    downloads: 3210,
    stars: 89,
    group: 'core',
    icon: 'Globe',
    tags: ['browser', 'scraping', 'automation', 'puppeteer'],
    npmPackage: 'sibercron-node-browserless',
    verified: true,
  },
  {
    id: 'sibercron-node-langchain',
    name: 'langchain',
    displayName: 'LangChain',
    description: 'LangChain.js entegrasyonu. Chains, agents, memory, vector stores, RAG pipeline oluşturma.',
    author: 'sibercron-community',
    version: '0.5.0',
    downloads: 2890,
    stars: 112,
    group: 'ai',
    icon: 'Link',
    tags: ['langchain', 'rag', 'vector', 'llm', 'agents'],
    npmPackage: 'sibercron-node-langchain',
    verified: false,
    featured: true,
  },
  {
    id: 'sibercron-node-shopify',
    name: 'shopify',
    displayName: 'Shopify',
    description: 'Shopify Admin & Storefront API. Ürün/sipariş/müşteri yönetimi, webhook tetikleyiciler.',
    author: 'sibercron-community',
    version: '1.1.5',
    downloads: 4102,
    stars: 76,
    group: 'data',
    icon: 'ShoppingCart',
    tags: ['shopify', 'ecommerce', 'orders', 'products'],
    npmPackage: 'sibercron-node-shopify',
    verified: true,
  },
  {
    id: 'sibercron-node-hubspot',
    name: 'hubspot',
    displayName: 'HubSpot CRM',
    description: 'HubSpot CRM entegrasyonu. Contact/deal/company CRUD, pipeline yönetimi, email tracking.',
    author: 'sibercron-community',
    version: '0.7.1',
    downloads: 1567,
    stars: 43,
    group: 'data',
    icon: 'Users',
    tags: ['crm', 'hubspot', 'sales', 'marketing'],
    npmPackage: 'sibercron-node-hubspot',
    verified: false,
  },
];

function getGroupLabels(t: (k: string) => string): Record<string, string> {
  return {
    all: t('marketplace.groupAll'),
    ai: t('marketplace.groupAI'),
    core: t('marketplace.groupCore'),
    data: t('marketplace.groupData'),
    messaging: t('marketplace.groupMessaging'),
    trigger: t('marketplace.groupTrigger'),
  };
}

const GROUP_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  all: Package,
  ai: Brain,
  core: Zap,
  data: Database,
  messaging: MessageSquare,
  trigger: Globe,
};

function formatDownloads(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/* ── Installed nodes panel ──────────────────────────────────────────────── */

function InstalledNodesPanel() {
  const { t } = useTranslation();
  const GROUP_LABELS = getGroupLabels(t);
  const allNodes = useNodeRegistryStore((s) => s.nodeTypes);

  const grouped = useMemo(() => {
    const map: Record<string, typeof allNodes> = {};
    for (const n of allNodes) {
      const g = n.group ?? 'core';
      if (!map[g]) map[g] = [];
      map[g].push(n);
    }
    return map;
  }, [allNodes]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <CheckCircle2 size={14} className="text-aurora-emerald" />
        <span className="text-sm font-semibold text-white">{allNodes.length} {t('marketplace.nodesInstalled')}</span>
      </div>
      {Object.entries(grouped)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([group, nodes]) => (
          <div key={group}>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-obsidian-400">
                {GROUP_LABELS[group] ?? group} ({nodes.length})
              </span>
            </div>
            <div className="space-y-1">
              {nodes.map((n) => (
                <div
                  key={n.name}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.03] transition-colors"
                >
                  <span className="text-xs text-obsidian-300 font-body flex-1 truncate">{n.displayName}</span>
                  <span className="text-[9px] text-obsidian-600 font-mono shrink-0">v{n.version ?? '1.0'}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

/* ── Node card ──────────────────────────────────────────────────────────── */

function NodeCard({ node, isInstalled }: { node: CommunityNode; isInstalled: boolean }) {
  const { t } = useTranslation();
  return (
    <div
      className={clsx(
        'glass-card rounded-2xl p-4 flex flex-col gap-3 hover:border-white/[0.12] transition-all group',
        node.featured && 'border-aurora-violet/20',
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
          <Package size={16} className="text-obsidian-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-sm font-semibold text-white truncate">{node.displayName}</span>
            {node.verified && (
              <span title={t('marketplace.verifiedPackage')}>
                <CheckCircle2 size={12} className="text-aurora-cyan shrink-0" />
              </span>
            )}
            {node.featured && (
              <span title={t('marketplace.featured')}>
                <Sparkles size={11} className="text-aurora-violet shrink-0" />
              </span>
            )}
          </div>
          <span className="text-[10px] text-obsidian-500 font-mono">{node.npmPackage}</span>
        </div>
        <span className="text-[10px] text-obsidian-600 font-mono shrink-0">v{node.version}</span>
      </div>

      {/* Description */}
      <p className="text-xs text-obsidian-400 leading-relaxed font-body line-clamp-2">
        {node.description}
      </p>

      {/* Tags */}
      <div className="flex flex-wrap gap-1">
        {node.tags.slice(0, 4).map((tag) => (
          <span
            key={tag}
            className="px-1.5 py-0.5 rounded-md text-[9px] bg-white/[0.04] text-obsidian-500 font-mono"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-[10px] text-obsidian-500">
            <Download size={10} />
            {formatDownloads(node.downloads)}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-obsidian-500">
            <Star size={10} />
            {node.stars}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <a
            href={`https://www.npmjs.com/package/${node.npmPackage}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-obsidian-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <ExternalLink size={9} />
            npm
          </a>
          {isInstalled ? (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] bg-aurora-emerald/10 text-aurora-emerald font-semibold">
              <CheckCircle2 size={9} />
              {t('marketplace.installed')}
            </span>
          ) : (
            <button
              onClick={() => {
                const cmd = `pnpm add ${node.npmPackage}`;
                navigator.clipboard?.writeText(cmd).catch(() => {});
                toast.success(`${t('marketplace.copiedToClipboard')} ${cmd}`, 4000);
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] bg-aurora-violet/10 text-aurora-violet hover:bg-aurora-violet/20 transition-colors font-semibold"
            >
              <Download size={9} />
              {t('marketplace.install')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────────────────── */

export default function MarketplacePage() {
  const { t } = useTranslation();
  const GROUP_LABELS = getGroupLabels(t);
  const [search, setSearch] = useState('');
  const [activeGroup, setActiveGroup] = useState('all');
  const [showInstalled, setShowInstalled] = useState(false);
  const [npmNodes, setNpmNodes] = useState<Partial<CommunityNode>[]>([]);
  const [npmLoading, setNpmLoading] = useState(false);
  const [npmFetched, setNpmFetched] = useState(false);
  const installedNodeNames = useNodeRegistryStore((s) => new Set(s.nodeTypes.map((n) => n.name)));

  /** Merge npm results with the hardcoded catalog, deduplicating by npmPackage */
  const allNodes = useMemo<CommunityNode[]>(() => {
    const existing = new Set(COMMUNITY_NODES.map((n) => n.npmPackage));
    const newFromNpm = npmNodes
      .filter((n) => n.npmPackage && !existing.has(n.npmPackage))
      .map((n) => n as CommunityNode);
    return [...COMMUNITY_NODES, ...newFromNpm];
  }, [npmNodes]);

  const fetchFromNpm = async () => {
    setNpmLoading(true);
    try {
      const results = await fetchNpmPackages();
      setNpmNodes(results);
      setNpmFetched(true);
      if (results.length > 0) {
        toast.success(`${results.length} ${t('marketplace.npmPackagesLoaded')}`, 3000);
      }
    } finally {
      setNpmLoading(false);
    }
  };

  // Auto-fetch on mount (non-blocking)
  useEffect(() => {
    void fetchFromNpm();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    let list = allNodes;
    if (activeGroup !== 'all') list = list.filter((n) => n.group === activeGroup);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (n) =>
          n.displayName.toLowerCase().includes(q) ||
          n.description.toLowerCase().includes(q) ||
          n.tags.some((t) => t.includes(q)),
      );
    }
    return list;
  }, [activeGroup, search, allNodes]);

  const featured = useMemo(() => allNodes.filter((n) => n.featured), [allNodes]);
  const groups = ['all', 'ai', 'core', 'data', 'messaging', 'trigger'];

  return (
    <div className="h-full flex bg-obsidian-950 overflow-hidden">
      {/* Left sidebar — installed nodes */}
      <div className="w-64 shrink-0 border-r border-white/[0.05] overflow-y-auto p-4 hidden xl:block">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 size={13} className="text-aurora-emerald" />
          <span className="text-xs font-semibold text-white">{t('marketplace.installedNodes')}</span>
        </div>
        <InstalledNodesPanel />
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-obsidian-950/95 backdrop-blur-sm border-b border-white/[0.05] px-6 py-4">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="text-lg font-bold text-white">Node Marketplace</h1>
              <p className="text-xs text-obsidian-400 mt-0.5">
                {t('marketplace.subtitle')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {npmFetched && npmNodes.length > 0 && (
                <span className="text-[10px] text-obsidian-500 hidden sm:block">
                  +{npmNodes.filter((n) => !COMMUNITY_NODES.some((c) => c.npmPackage === n.npmPackage)).length} {t('marketplace.npmPackages')}
                </span>
              )}
              <button
                onClick={() => void fetchFromNpm()}
                disabled={npmLoading}
                className="btn-ghost text-xs hidden sm:flex"
                title={t('marketplace.refreshFromNpm')}
              >
                <RefreshCw size={12} className={npmLoading ? 'animate-spin' : ''} />
                {npmLoading ? t('marketplace.loading') : t('marketplace.refresh')}
              </button>
              <a
                href="https://www.npmjs.com/search?q=sibercron-node"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost text-xs hidden sm:flex"
              >
                <ExternalLink size={12} />
                {t('marketplace.searchOnNpm')}
              </a>
            </div>
          </div>

          {/* Search + filters */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-obsidian-500" />
              <input
                type="text"
                placeholder={t('marketplace.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white placeholder:text-obsidian-600 focus:outline-none focus:border-aurora-cyan/30 font-body"
              />
            </div>

            {/* Group filter tabs */}
            <div className="flex items-center gap-1">
              {groups.map((g) => {
                const Icon = GROUP_ICONS[g] ?? Package;
                return (
                  <button
                    key={g}
                    onClick={() => setActiveGroup(g)}
                    className={clsx(
                      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors',
                      activeGroup === g
                        ? 'bg-aurora-violet/15 text-aurora-violet border border-aurora-violet/20'
                        : 'text-obsidian-400 hover:text-white hover:bg-white/[0.04]',
                    )}
                  >
                    <Icon size={11} />
                    <span className="hidden md:block">{GROUP_LABELS[g]}</span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setShowInstalled((v) => !v)}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors xl:hidden',
                showInstalled
                  ? 'bg-aurora-emerald/15 text-aurora-emerald border border-aurora-emerald/20'
                  : 'text-obsidian-400 hover:text-white hover:bg-white/[0.04]',
              )}
            >
              <Filter size={11} />
              {t('marketplace.installed')}
            </button>
          </div>
        </div>

        <div className="p-6 space-y-8">
          {/* Installed nodes drawer (mobile) */}
          {showInstalled && (
            <div className="xl:hidden glass-card rounded-2xl p-4">
              <InstalledNodesPanel />
            </div>
          )}

          {/* Featured section */}
          {!search && activeGroup === 'all' && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles size={14} className="text-aurora-violet" />
                <h2 className="text-sm font-semibold text-white">{t('marketplace.featuredSection')}</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {featured.map((node) => (
                  <NodeCard
                    key={node.id}
                    node={node}
                    isInstalled={installedNodeNames.has(`sibercron.${node.name}`)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* All / filtered results */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Package size={14} className="text-obsidian-400" />
                <h2 className="text-sm font-semibold text-white">
                  {search || activeGroup !== 'all' ? t('marketplace.results') : t('marketplace.allNodes')}
                </h2>
                <span className="text-xs text-obsidian-500">
                  ({filtered.length}{filtered.length !== allNodes.length ? ` / ${allNodes.length}` : ''})
                </span>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-16">
                <Package size={40} className="mx-auto text-obsidian-700 mb-3" />
                <p className="text-sm text-obsidian-400">{t('marketplace.noResults')}</p>
                <p className="text-xs text-obsidian-600 mt-1">
                  {t('marketplace.noResultsHint')}{' '}
                  <code className="font-mono text-obsidian-400">npx create-sibercron-node {search || 'my-node'}</code>
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
                {filtered.map((node) => (
                  <NodeCard
                    key={node.id}
                    node={node}
                    isInstalled={installedNodeNames.has(`sibercron.${node.name}`)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Create your own CTA */}
          <section className="glass-card rounded-2xl p-6 border-dashed border-aurora-violet/20">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-aurora-violet/10 flex items-center justify-center shrink-0">
                <Sparkles size={18} className="text-aurora-violet" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-white mb-1">{t('marketplace.createOwn')}</h3>
                <p className="text-xs text-obsidian-400 font-body mb-3">
                  {t('marketplace.createOwnDesc')}
                </p>
                <div className="bg-obsidian-900/80 rounded-xl px-4 py-2.5 font-mono text-xs text-aurora-cyan border border-white/[0.04]">
                  npx create-sibercron-node my-node --group ai
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
