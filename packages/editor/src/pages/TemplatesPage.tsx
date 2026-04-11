import { useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  Newspaper,
  Github,
  Calendar,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import clsx from 'clsx';
import type { Node, Edge } from '@xyflow/react';

interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
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
    name: 'AI Customer Support',
    description:
      'Automatically respond to customer inquiries using OpenAI GPT. Connects webhook trigger to AI analysis, sentiment detection, and Slack/email routing based on urgency.',
    category: 'AI',
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
    name: 'Daily News Digest',
    description:
      'Fetch top stories from multiple RSS feeds every morning, summarize them with AI, and deliver a curated digest via email. Perfect for staying informed on autopilot.',
    category: 'Automation',
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
    name: 'GitHub Issue Responder',
    description:
      'Listens for new GitHub issues via webhook, uses AI to categorize and draft responses, then posts an initial reply and labels the issue automatically.',
    category: 'DevOps',
    categoryColor: 'text-aurora-emerald bg-aurora-emerald/10',
    icon: Github,
    iconColor: 'text-aurora-emerald',
    iconBg: 'bg-aurora-emerald/10',
    glowColor: 'group-hover:shadow-neon-green',
    nodes: [
      { id: 'node_tpl_1', type: 'siberNode', position: { x: 50, y: 200 }, data: { nodeType: 'sibercron.webhookTrigger', label: 'GitHub Webhook', parameters: { path: '/github-issues' } } },
      { id: 'node_tpl_2', type: 'siberNode', position: { x: 300, y: 200 }, data: { nodeType: 'sibercron.aiAgent', label: 'AI Categorize', parameters: { userPrompt: 'Categorize this GitHub issue and draft a response.', provider: 'anthropic' } } },
      { id: 'node_tpl_3', type: 'siberNode', position: { x: 550, y: 100 }, data: { nodeType: 'sibercron.httpRequest', label: 'Post Comment', parameters: { method: 'POST' } } },
      { id: 'node_tpl_4', type: 'siberNode', position: { x: 550, y: 300 }, data: { nodeType: 'sibercron.httpRequest', label: 'Add Labels', parameters: { method: 'POST' } } },
      { id: 'node_tpl_5', type: 'siberNode', position: { x: 800, y: 100 }, data: { nodeType: 'sibercron.slackSend', label: 'Notify Team', parameters: { channel: '#github' } } },
      { id: 'node_tpl_6', type: 'siberNode', position: { x: 800, y: 300 }, data: { nodeType: 'sibercron.log', label: 'Log Result', parameters: {} } },
    ],
    edges: [
      { id: 'edge_tpl_1', source: 'node_tpl_1', target: 'node_tpl_2' },
      { id: 'edge_tpl_2', source: 'node_tpl_2', target: 'node_tpl_3' },
      { id: 'edge_tpl_3', source: 'node_tpl_2', target: 'node_tpl_4' },
      { id: 'edge_tpl_4', source: 'node_tpl_3', target: 'node_tpl_5' },
      { id: 'edge_tpl_5', source: 'node_tpl_4', target: 'node_tpl_6' },
    ],
  },
  {
    id: 'social-media-scheduler',
    name: 'Social Media Scheduler',
    description:
      'Schedule and publish content across Twitter, LinkedIn, and Instagram on a cron schedule. Includes AI-powered caption generation and image optimization.',
    category: 'Marketing',
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
  const navigate = useNavigate();

  const handleUseTemplate = (tpl: TemplateDefinition) => {
    navigate('/workflows/new', {
      state: {
        template: {
          name: tpl.name,
          nodes: tpl.nodes,
          edges: tpl.edges,
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
            Templates
          </span>
        </div>
        <h1 className="text-3xl font-display font-bold text-white tracking-tight">
          Templates
        </h1>
        <p className="text-sm text-obsidian-400 mt-1.5 font-body">
          Start quickly with pre-built workflow templates
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {TEMPLATES.map((tpl, i) => {
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
                      {tpl.name}
                    </h3>
                    <span className={clsx('badge text-[10px]', tpl.categoryColor)}>
                      {tpl.category}
                    </span>
                  </div>
                  <p className="text-xs text-obsidian-400 leading-relaxed font-body">
                    {tpl.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] text-obsidian-500 font-body">
                  <Sparkles size={10} className="text-aurora-cyan" />
                  <span>{tpl.nodes.length} nodes</span>
                </div>
                <button
                  onClick={() => handleUseTemplate(tpl)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-aurora-cyan hover:bg-aurora-cyan/10 transition-all font-body"
                >
                  Use Template
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
