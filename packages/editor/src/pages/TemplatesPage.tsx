import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkflowStore } from '../store/workflowStore';
import {
  MessageSquare,
  Newspaper,
  Github,
  Calendar,
  ArrowRight,
  Sparkles,
  Layers,
  Rss,
  Search,
} from 'lucide-react';
import clsx from 'clsx';
import type { Node, Edge } from '@xyflow/react';
import { useTranslation } from '../i18n';

interface TemplateDefinition {
  id: string;
  nameKey: string;
  descKey: string;
  categoryKey: string;
  categoryColor: string;
  icon: typeof MessageSquare;
  iconColor: string;
  iconBg: string;
  glowColor: string;
  nodes: Node[];
  edges: Edge[];
}

const TEMPLATES: TemplateDefinition[] = [
  {
    id: 'ai-customer-support',
    nameKey: 'templates.aiCustomerSupport',
    descKey: 'templates.aiCustomerSupportDesc',
    categoryKey: 'templates.categoryAI',
    categoryColor: 'text-aurora-violet bg-aurora-violet/10',
    icon: MessageSquare,
    iconColor: 'text-aurora-violet',
    iconBg: 'bg-aurora-violet/10',
    glowColor: 'group-hover:shadow-neon-violet',
    nodes: [
      { id: 'node_tpl_1', type: 'siberNode', position: { x: 50, y: 200 }, data: { nodeType: 'sibercron.webhookTrigger', label: 'Webhook Trigger', parameters: { path: '/customer-support' } } },
      { id: 'node_tpl_2', type: 'siberNode', position: { x: 300, y: 200 }, data: { nodeType: 'sibercron.aiAgent', label: 'AI Analysis', parameters: { userPrompt: 'Analyze customer message and determine sentiment and urgency.', provider: 'openai' } } },
      { id: 'node_tpl_3', type: 'siberNode', position: { x: 550, y: 100 }, data: { nodeType: 'sibercron.conditional', label: 'Urgency Check', parameters: { condition: '{{ $json.urgency === "high" }}' } } },
      { id: 'node_tpl_4', type: 'siberNode', position: { x: 800, y: 50 }, data: { nodeType: 'sibercron.slackSend', label: 'Slack Alert', parameters: { channel: '#support-urgent' } } },
      { id: 'node_tpl_5', type: 'siberNode', position: { x: 800, y: 250 }, data: { nodeType: 'sibercron.emailSmtp', label: 'Email Response', parameters: {} } },
    ],
    edges: [
      { id: 'edge_tpl_1', source: 'node_tpl_1', target: 'node_tpl_2' },
      { id: 'edge_tpl_2', source: 'node_tpl_2', target: 'node_tpl_3' },
      { id: 'edge_tpl_3', source: 'node_tpl_3', sourceHandle: 'true', target: 'node_tpl_4' },
      { id: 'edge_tpl_4', source: 'node_tpl_3', sourceHandle: 'false', target: 'node_tpl_5' },
    ],
  },
  {
    id: 'daily-news-digest',
    nameKey: 'templates.dailyNewsDigest',
    descKey: 'templates.dailyNewsDigestDesc',
    categoryKey: 'templates.categoryAutomation',
    categoryColor: 'text-aurora-cyan bg-aurora-cyan/10',
    icon: Newspaper,
    iconColor: 'text-aurora-cyan',
    iconBg: 'bg-aurora-cyan/10',
    glowColor: 'group-hover:shadow-neon-green',
    nodes: [
      { id: 'node_tpl_1', type: 'siberNode', position: { x: 50, y: 200 }, data: { nodeType: 'sibercron.cronTrigger', label: 'Daily Schedule', parameters: { cronExpression: '0 8 * * *' } } },
      { id: 'node_tpl_2', type: 'siberNode', position: { x: 300, y: 200 }, data: { nodeType: 'sibercron.httpRequest', label: 'Fetch RSS Feeds', parameters: { url: 'https://news.example.com/rss', method: 'GET' } } },
      { id: 'node_tpl_3', type: 'siberNode', position: { x: 550, y: 200 }, data: { nodeType: 'sibercron.aiAgent', label: 'AI Summarize', parameters: { userPrompt: 'Summarize these news articles into a concise digest.', provider: 'openai' } } },
      { id: 'node_tpl_4', type: 'siberNode', position: { x: 800, y: 200 }, data: { nodeType: 'sibercron.emailSmtp', label: 'Send Digest', parameters: {} } },
    ],
    edges: [
      { id: 'edge_tpl_1', source: 'node_tpl_1', target: 'node_tpl_2' },
      { id: 'edge_tpl_2', source: 'node_tpl_2', target: 'node_tpl_3' },
      { id: 'edge_tpl_3', source: 'node_tpl_3', target: 'node_tpl_4' },
    ],
  },
  {
    id: 'github-issue-responder',
    nameKey: 'templates.githubIssueResponder',
    descKey: 'templates.githubIssueResponderDesc',
    categoryKey: 'templates.categoryDevOps',
    categoryColor: 'text-aurora-emerald bg-aurora-emerald/10',
    icon: Github,
    iconColor: 'text-aurora-emerald',
    iconBg: 'bg-aurora-emerald/10',
    glowColor: 'group-hover:shadow-neon-green',
    nodes: [
      { id: 'node_tpl_1', type: 'siberNode', position: { x: 50, y: 200 }, data: { nodeType: 'sibercron.githubTrigger', label: 'GitHub Trigger', parameters: { events: 'issues' } } },
      { id: 'node_tpl_2', type: 'siberNode', position: { x: 300, y: 200 }, data: { nodeType: 'sibercron.aiAgent', label: 'AI Categorize', parameters: { userPrompt: 'Categorize this GitHub issue (bug/feature/question) and draft a helpful initial comment.', provider: 'anthropic' } } },
      { id: 'node_tpl_3', type: 'siberNode', position: { x: 550, y: 200 }, data: { nodeType: 'sibercron.github', label: 'Post Comment', parameters: { resource: 'comment', commentOperation: 'create' } } },
      { id: 'node_tpl_4', type: 'siberNode', position: { x: 800, y: 200 }, data: { nodeType: 'sibercron.slackSend', label: 'Notify Team', parameters: { channel: '#github-issues' } } },
      { id: 'node_tpl_5', type: 'siberNode', position: { x: 1050, y: 200 }, data: { nodeType: 'sibercron.log', label: 'Log Result', parameters: {} } },
    ],
    edges: [
      { id: 'edge_tpl_1', source: 'node_tpl_1', target: 'node_tpl_2' },
      { id: 'edge_tpl_2', source: 'node_tpl_2', target: 'node_tpl_3' },
      { id: 'edge_tpl_3', source: 'node_tpl_3', target: 'node_tpl_4' },
      { id: 'edge_tpl_4', source: 'node_tpl_4', target: 'node_tpl_5' },
    ],
  },
  {
    id: 'jira-bug-triage',
    nameKey: 'templates.jiraBugTriage',
    descKey: 'templates.jiraBugTriageDesc',
    categoryKey: 'templates.categoryDevOps',
    categoryColor: 'text-aurora-emerald bg-aurora-emerald/10',
    icon: Layers,
    iconColor: 'text-aurora-emerald',
    iconBg: 'bg-aurora-emerald/10',
    glowColor: 'group-hover:shadow-neon-green',
    nodes: [
      { id: 'node_tpl_1', type: 'siberNode', position: { x: 50, y: 200 }, data: { nodeType: 'sibercron.cronTrigger', label: 'Daily Triage', parameters: { cronExpression: '0 9 * * 1-5' } } },
      { id: 'node_tpl_2', type: 'siberNode', position: { x: 300, y: 200 }, data: { nodeType: 'sibercron.jira', label: 'Search Bugs', parameters: { resource: 'issue', issueOperation: 'search', jql: 'issuetype = Bug AND assignee is EMPTY AND status = "To Do" ORDER BY created DESC', maxResults: 20 } } },
      { id: 'node_tpl_3', type: 'siberNode', position: { x: 550, y: 200 }, data: { nodeType: 'sibercron.aiClassifier', label: 'Classify Severity', parameters: { categories: 'critical,high,medium,low', userPrompt: 'Classify this bug by severity based on the summary and description.' } } },
      { id: 'node_tpl_4', type: 'siberNode', position: { x: 800, y: 100 }, data: { nodeType: 'sibercron.jira', label: 'Update Priority', parameters: { resource: 'issue', issueOperation: 'update' } } },
      { id: 'node_tpl_5', type: 'siberNode', position: { x: 800, y: 300 }, data: { nodeType: 'sibercron.slackSend', label: 'Triage Summary', parameters: { channel: '#dev-bugs' } } },
    ],
    edges: [
      { id: 'edge_tpl_1', source: 'node_tpl_1', target: 'node_tpl_2' },
      { id: 'edge_tpl_2', source: 'node_tpl_2', target: 'node_tpl_3' },
      { id: 'edge_tpl_3', source: 'node_tpl_3', target: 'node_tpl_4' },
      { id: 'edge_tpl_4', source: 'node_tpl_3', target: 'node_tpl_5' },
    ],
  },
  {
    id: 'rss-to-notion',
    nameKey: 'templates.rssNotionKnowledgeBase',
    descKey: 'templates.rssNotionKnowledgeBaseDesc',
    categoryKey: 'templates.categoryAutomation',
    categoryColor: 'text-aurora-cyan bg-aurora-cyan/10',
    icon: Rss,
    iconColor: 'text-aurora-cyan',
    iconBg: 'bg-aurora-cyan/10',
    glowColor: 'group-hover:shadow-neon-green',
    nodes: [
      { id: 'node_tpl_1', type: 'siberNode', position: { x: 50, y: 200 }, data: { nodeType: 'sibercron.cronTrigger', label: 'Hourly Check', parameters: { cronExpression: '0 * * * *' } } },
      { id: 'node_tpl_2', type: 'siberNode', position: { x: 300, y: 200 }, data: { nodeType: 'sibercron.rssFeed', label: 'Fetch RSS', parameters: { feedUrl: 'https://example.com/rss', maxItems: 10 } } },
      { id: 'node_tpl_3', type: 'siberNode', position: { x: 550, y: 200 }, data: { nodeType: 'sibercron.aiClassifier', label: 'Relevance Filter', parameters: { categories: 'relevant,not_relevant', userPrompt: 'Is this article relevant to software engineering and AI?' } } },
      { id: 'node_tpl_4', type: 'siberNode', position: { x: 800, y: 100 }, data: { nodeType: 'sibercron.aiSummarizer', label: 'Summarize', parameters: { mode: 'bullets', language: 'en' } } },
      { id: 'node_tpl_5', type: 'siberNode', position: { x: 1050, y: 100 }, data: { nodeType: 'sibercron.notionDatabase', label: 'Save to Notion', parameters: { operation: 'createPage' } } },
      { id: 'node_tpl_6', type: 'siberNode', position: { x: 800, y: 300 }, data: { nodeType: 'sibercron.log', label: 'Skip Log', parameters: { message: 'Article filtered out as not relevant' } } },
    ],
    edges: [
      { id: 'edge_tpl_1', source: 'node_tpl_1', target: 'node_tpl_2' },
      { id: 'edge_tpl_2', source: 'node_tpl_2', target: 'node_tpl_3' },
      { id: 'edge_tpl_3', source: 'node_tpl_3', target: 'node_tpl_4' },
      { id: 'edge_tpl_4', source: 'node_tpl_4', target: 'node_tpl_5' },
      { id: 'edge_tpl_5', source: 'node_tpl_3', target: 'node_tpl_6' },
    ],
  },
  {
    id: 'social-media-scheduler',
    nameKey: 'templates.socialMediaScheduler',
    descKey: 'templates.socialMediaSchedulerDesc',
    categoryKey: 'templates.categoryMarketing',
    categoryColor: 'text-aurora-pink bg-aurora-pink/10',
    icon: Calendar,
    iconColor: 'text-aurora-pink',
    iconBg: 'bg-aurora-pink/10',
    glowColor: 'group-hover:shadow-neon-violet',
    nodes: [
      { id: 'node_tpl_1', type: 'siberNode', position: { x: 50, y: 200 }, data: { nodeType: 'sibercron.cronTrigger', label: 'Schedule Trigger', parameters: { cronExpression: '0 10,14,18 * * *' } } },
      { id: 'node_tpl_2', type: 'siberNode', position: { x: 300, y: 200 }, data: { nodeType: 'sibercron.httpRequest', label: 'Fetch Content', parameters: { method: 'GET' } } },
      { id: 'node_tpl_3', type: 'siberNode', position: { x: 550, y: 200 }, data: { nodeType: 'sibercron.aiAgent', label: 'Generate Captions', parameters: { userPrompt: 'Generate engaging social media captions for this content.', provider: 'openai' } } },
      { id: 'node_tpl_4', type: 'siberNode', position: { x: 800, y: 100 }, data: { nodeType: 'sibercron.httpRequest', label: 'Post to Twitter', parameters: { method: 'POST' } } },
      { id: 'node_tpl_5', type: 'siberNode', position: { x: 800, y: 200 }, data: { nodeType: 'sibercron.httpRequest', label: 'Post to LinkedIn', parameters: { method: 'POST' } } },
      { id: 'node_tpl_6', type: 'siberNode', position: { x: 800, y: 300 }, data: { nodeType: 'sibercron.httpRequest', label: 'Post to Instagram', parameters: { method: 'POST' } } },
      { id: 'node_tpl_7', type: 'siberNode', position: { x: 1050, y: 200 }, data: { nodeType: 'sibercron.log', label: 'Log Results', parameters: {} } },
    ],
    edges: [
      { id: 'edge_tpl_1', source: 'node_tpl_1', target: 'node_tpl_2' },
      { id: 'edge_tpl_2', source: 'node_tpl_2', target: 'node_tpl_3' },
      { id: 'edge_tpl_3', source: 'node_tpl_3', target: 'node_tpl_4' },
      { id: 'edge_tpl_4', source: 'node_tpl_3', target: 'node_tpl_5' },
      { id: 'edge_tpl_5', source: 'node_tpl_3', target: 'node_tpl_6' },
      { id: 'edge_tpl_6', source: 'node_tpl_4', target: 'node_tpl_7' },
      { id: 'edge_tpl_7', source: 'node_tpl_5', target: 'node_tpl_7' },
      { id: 'edge_tpl_8', source: 'node_tpl_6', target: 'node_tpl_7' },
    ],
  },
];

export default function TemplatesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const storeNodes = useWorkflowStore((s) => s.nodes);

  const filteredTemplates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return TEMPLATES;
    return TEMPLATES.filter(
      (tpl) =>
        t(tpl.nameKey).toLowerCase().includes(q) ||
        t(tpl.descKey).toLowerCase().includes(q) ||
        t(tpl.categoryKey).toLowerCase().includes(q),
    );
  }, [searchQuery, t]);

  const handleUseTemplate = (tpl: TemplateDefinition) => {
    if (storeNodes.length > 0) {
      if (!window.confirm(t('templates.confirmOverwrite') ?? 'Mevcut workflow silinecek. Devam?')) return;
    }

    // Remap node IDs to fresh UUIDs to prevent ID collisions
    const idMap = new Map<string, string>();
    const freshNodes = tpl.nodes.map((n) => {
      const newId = crypto.randomUUID();
      idMap.set(n.id, newId);
      return { ...n, id: newId };
    });
    const freshEdges = tpl.edges.map((e) => ({
      ...e,
      id: crypto.randomUUID(),
      source: idMap.get(e.source) ?? e.source,
      target: idMap.get(e.target) ?? e.target,
    }));

    navigate('/workflows/new', {
      state: {
        template: {
          name: t(tpl.nameKey),
          nodes: freshNodes,
          edges: freshEdges,
        },
      },
    });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-2 h-2 rounded-full bg-aurora-violet animate-glow-pulse" />
          <span className="text-[11px] font-semibold text-aurora-violet tracking-widest uppercase font-body">
            {t('sidebar.templates')}
          </span>
        </div>
        <h1 className="text-3xl font-display font-bold text-white tracking-tight">
          {t('templates.title')}
        </h1>
        <p className="text-sm text-obsidian-400 mt-1.5 font-body">
          {t('templates.subtitle')}
        </p>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-obsidian-500 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('templates.searchPlaceholder')}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-obsidian-500 focus:outline-none focus:border-aurora-cyan/40 transition-colors font-body"
        />
      </div>

      {filteredTemplates.length === 0 && (
        <p className="text-sm text-obsidian-500 text-center py-8 font-body">
          {t('templates.noSearchResults')}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredTemplates.map((tpl, i) => {
          const Icon = tpl.icon;
          return (
            <div
              key={tpl.id}
              className={clsx(
                'glass-card rounded-2xl p-6 group transition-all duration-300 animate-slide-up',
                tpl.glowColor,
                `stagger-${i + 1}`,
              )}
              style={{ animationFillMode: 'both' }}
            >
              <div className="flex items-start gap-4 mb-5">
                <div
                  className={clsx(
                    'w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110',
                    tpl.iconBg,
                  )}
                >
                  <Icon size={22} className={tpl.iconColor} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <h3 className="text-[15px] font-display font-semibold text-white group-hover:text-aurora-cyan transition-colors">
                      {t(tpl.nameKey)}
                    </h3>
                    <span className={clsx('badge text-[10px]', tpl.categoryColor)}>
                      {t(tpl.categoryKey)}
                    </span>
                  </div>
                  <p className="text-xs text-obsidian-400 leading-relaxed font-body">
                    {t(tpl.descKey)}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] text-obsidian-500 font-body">
                  <Sparkles size={10} className="text-aurora-cyan" />
                  <span>{tpl.nodes.length} node</span>
                </div>
                <button
                  onClick={() => handleUseTemplate(tpl)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-aurora-cyan hover:bg-aurora-cyan/10 transition-all font-body"
                >
                  {t('templates.useTemplate')}
                  <ArrowRight size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
