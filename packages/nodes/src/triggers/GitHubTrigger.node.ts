import crypto from 'node:crypto';
import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

/**
 * GitHubTrigger — listens for GitHub webhook events.
 * Validates the X-Hub-Signature-256 HMAC header (when a secret is configured)
 * and filters by event type and optional repository name.
 *
 * The node passes through the raw GitHub payload enriched with:
 *   _github.event       — GitHub-Event header value (push, pull_request, issues…)
 *   _github.delivery    — X-GitHub-Delivery UUID
 *   _github.repository  — repository full_name from the payload
 *   _github.sender      — sender.login from the payload
 */
export const GitHubTriggerNode: INodeType = {
  definition: {
    displayName: 'GitHub Trigger',
    name: 'sibercron.githubTrigger',
    icon: 'Github',
    color: '#24292E',
    group: 'trigger',
    version: 1,
    description: 'Trigger a workflow from GitHub webhook events (push, PR, issues, release…)',
    inputs: [],
    outputs: ['main'],
    credentials: [
      { name: 'githubWebhook', required: false, displayName: 'GitHub Webhook Secret' },
    ],
    properties: [
      {
        name: 'events',
        displayName: 'Events',
        type: 'select',
        default: '*',
        required: true,
        description: 'GitHub event type(s) to react to. Use * for all events.',
        options: [
          { name: 'All Events (*)', value: '*' },
          { name: 'Push', value: 'push' },
          { name: 'Pull Request', value: 'pull_request' },
          { name: 'Issues', value: 'issues' },
          { name: 'Issue Comment', value: 'issue_comment' },
          { name: 'Release', value: 'release' },
          { name: 'Create (branch/tag)', value: 'create' },
          { name: 'Delete (branch/tag)', value: 'delete' },
          { name: 'Workflow Run', value: 'workflow_run' },
          { name: 'Check Run', value: 'check_run' },
          { name: 'Star', value: 'star' },
          { name: 'Fork', value: 'fork' },
          { name: 'Status', value: 'status' },
        ],
      },
      {
        name: 'repositoryFilter',
        displayName: 'Repository Filter',
        type: 'string',
        default: '',
        required: false,
        description: 'Only trigger for this repository (format: owner/repo). Leave blank to accept all.',
        placeholder: 'octocat/hello-world',
      },
      {
        name: 'branchFilter',
        displayName: 'Branch Filter (push events)',
        type: 'string',
        default: '',
        required: false,
        description: 'Only trigger for this branch on push events (e.g. "main"). Leave blank for all branches.',
        placeholder: 'main',
        displayOptions: { show: { events: ['push', '*'] } },
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const inputData = context.getInputData();

    // If there is no incoming webhook payload (e.g. test run), return placeholder
    if (!inputData.length) {
      return [{ json: { triggeredAt: new Date().toISOString(), type: 'github_trigger' } }];
    }

    const payload = inputData[0].json as Record<string, unknown>;
    const meta = (payload['_webhookMeta'] ?? {}) as Record<string, unknown>;
    const headers = (meta['headers'] ?? {}) as Record<string, string>;

    const githubEvent = headers['x-github-event'] ?? headers['X-GitHub-Event'] ?? 'unknown';
    const delivery = headers['x-github-delivery'] ?? headers['X-GitHub-Delivery'] ?? '';
    const signature = headers['x-hub-signature-256'] ?? headers['X-Hub-Signature-256'] ?? '';

    // ── Signature validation ──────────────────────────────────────────────
    let credentials: Record<string, unknown> = {};
    try { credentials = await context.getCredential('githubWebhook'); } catch { /* optional */ }
    const secret = (credentials['secret'] as string) ?? '';

    if (secret) {
      const rawBody = (meta['rawBody'] as string | undefined) ?? JSON.stringify(payload);
      const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
      // Constant-time comparison to prevent timing attacks
      const sigBuffer = Buffer.from(signature.padEnd(expected.length, '\0'));
      const expBuffer = Buffer.from(expected.padEnd(signature.length, '\0'));
      const valid = sigBuffer.length === expBuffer.length && crypto.timingSafeEqual(sigBuffer, expBuffer);
      if (!valid) {
        throw new Error(`GitHub webhook signature mismatch — check the webhook secret`);
      }
    }

    // ── Event filter ──────────────────────────────────────────────────────
    const eventsFilter = context.getParameter<string>('events') ?? '*';
    if (eventsFilter !== '*' && githubEvent !== eventsFilter) {
      context.helpers.log(`GitHub Trigger: skipping event "${githubEvent}" (filter="${eventsFilter}")`);
      return [];
    }

    // ── Repository filter ─────────────────────────────────────────────────
    const repoFilter = (context.getParameter<string>('repositoryFilter') ?? '').trim();
    const repoPayload = payload['repository'] as Record<string, unknown> | undefined;
    const repoFullName = (repoPayload?.['full_name'] as string) ?? '';
    if (repoFilter && repoFullName && repoFullName.toLowerCase() !== repoFilter.toLowerCase()) {
      context.helpers.log(`GitHub Trigger: skipping repository "${repoFullName}" (filter="${repoFilter}")`);
      return [];
    }

    // ── Branch filter (push events) ───────────────────────────────────────
    const branchFilter = (context.getParameter<string>('branchFilter') ?? '').trim();
    if (branchFilter && githubEvent === 'push') {
      const ref = (payload['ref'] as string) ?? '';
      const branch = ref.replace(/^refs\/heads\//, '');
      if (branch.toLowerCase() !== branchFilter.toLowerCase()) {
        context.helpers.log(`GitHub Trigger: skipping branch "${branch}" (filter="${branchFilter}")`);
        return [];
      }
    }

    const sender = (payload['sender'] as Record<string, unknown> | undefined)?.['login'] as string | undefined;

    // Build enriched output — raw GitHub payload + extracted metadata
    const { _webhookMeta: _m, ...cleanPayload } = payload;
    return [{
      json: {
        ...cleanPayload,
        _github: {
          event: githubEvent,
          delivery,
          repository: repoFullName,
          sender: sender ?? '',
          triggeredAt: new Date().toISOString(),
        },
      },
    }];
  },
};
