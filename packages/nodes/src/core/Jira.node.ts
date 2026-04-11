import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

/**
 * Jira node — interacts with the Jira Cloud REST API v3.
 * Auth: Basic Auth (email + API token) or OAuth2 Bearer token.
 * Supports: Issues (CRUD, search), Projects (list/get), Comments, Transitions.
 */
export const JiraNode: INodeType = {
  definition: {
    displayName: 'Jira',
    name: 'sibercron.jira',
    icon: 'Layers',
    color: '#0052CC',
    group: 'data',
    version: 1,
    description: 'Manage Jira issues, projects, comments and transitions',
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      { name: 'jiraApi', required: true, displayName: 'Jira API Credentials' },
    ],
    properties: [
      {
        name: 'resource',
        displayName: 'Resource',
        type: 'select',
        default: 'issue',
        required: true,
        options: [
          { name: 'Issue', value: 'issue' },
          { name: 'Comment', value: 'comment' },
          { name: 'Transition', value: 'transition' },
          { name: 'Project', value: 'project' },
        ],
      },
      // ── Issue operations ──────────────────────────────────────────────
      {
        name: 'issueOperation',
        displayName: 'Operation',
        type: 'select',
        default: 'get',
        options: [
          { name: 'Create Issue', value: 'create' },
          { name: 'Get Issue', value: 'get' },
          { name: 'Update Issue', value: 'update' },
          { name: 'Delete Issue', value: 'delete' },
          { name: 'Search (JQL)', value: 'search' },
        ],
        displayOptions: { show: { resource: ['issue'] } },
      },
      // ── Comment operations ────────────────────────────────────────────
      {
        name: 'commentOperation',
        displayName: 'Operation',
        type: 'select',
        default: 'list',
        options: [
          { name: 'List Comments', value: 'list' },
          { name: 'Add Comment', value: 'add' },
          { name: 'Update Comment', value: 'update' },
          { name: 'Delete Comment', value: 'delete' },
        ],
        displayOptions: { show: { resource: ['comment'] } },
      },
      // ── Transition operations ─────────────────────────────────────────
      {
        name: 'transitionOperation',
        displayName: 'Operation',
        type: 'select',
        default: 'list',
        options: [
          { name: 'List Transitions', value: 'list' },
          { name: 'Perform Transition', value: 'perform' },
        ],
        displayOptions: { show: { resource: ['transition'] } },
      },
      // ── Project operations ────────────────────────────────────────────
      {
        name: 'projectOperation',
        displayName: 'Operation',
        type: 'select',
        default: 'list',
        options: [
          { name: 'List Projects', value: 'list' },
          { name: 'Get Project', value: 'get' },
        ],
        displayOptions: { show: { resource: ['project'] } },
      },
      // ── Common: Issue Key ─────────────────────────────────────────────
      {
        name: 'issueKey',
        displayName: 'Issue Key',
        type: 'string',
        default: '',
        description: 'Jira issue key (e.g. "PROJ-123")',
        placeholder: 'PROJ-123',
        displayOptions: {
          show: {
            resource: ['issue', 'comment', 'transition'],
            issueOperation: ['get', 'update', 'delete'],
            commentOperation: ['list', 'add', 'update', 'delete'],
            transitionOperation: ['list', 'perform'],
          },
        },
      },
      // ── Project key ────────────────────────────────────────────────────
      {
        name: 'projectKey',
        displayName: 'Project Key',
        type: 'string',
        default: '',
        description: 'Jira project key (e.g. "PROJ")',
        placeholder: 'PROJ',
        displayOptions: {
          show: {
            resource: ['issue', 'project'],
            issueOperation: ['create'],
            projectOperation: ['get'],
          },
        },
      },
      // ── Issue: summary / description / type ─────────────────────────
      {
        name: 'summary',
        displayName: 'Summary',
        type: 'string',
        default: '',
        description: 'Issue summary (title)',
        displayOptions: { show: { resource: ['issue'], issueOperation: ['create', 'update'] } },
      },
      {
        name: 'description',
        displayName: 'Description',
        type: 'string',
        default: '',
        description: 'Issue description (plain text)',
        displayOptions: { show: { resource: ['issue'], issueOperation: ['create', 'update'] } },
      },
      {
        name: 'issueType',
        displayName: 'Issue Type',
        type: 'select',
        default: 'Task',
        options: [
          { name: 'Task', value: 'Task' },
          { name: 'Bug', value: 'Bug' },
          { name: 'Story', value: 'Story' },
          { name: 'Epic', value: 'Epic' },
          { name: 'Sub-task', value: 'Sub-task' },
        ],
        displayOptions: { show: { resource: ['issue'], issueOperation: ['create'] } },
      },
      {
        name: 'priority',
        displayName: 'Priority',
        type: 'select',
        default: 'Medium',
        options: [
          { name: 'Highest', value: 'Highest' },
          { name: 'High', value: 'High' },
          { name: 'Medium', value: 'Medium' },
          { name: 'Low', value: 'Low' },
          { name: 'Lowest', value: 'Lowest' },
        ],
        displayOptions: { show: { resource: ['issue'], issueOperation: ['create', 'update'] } },
      },
      {
        name: 'assignee',
        displayName: 'Assignee Account ID',
        type: 'string',
        default: '',
        description: 'Jira user accountId to assign the issue to',
        displayOptions: { show: { resource: ['issue'], issueOperation: ['create', 'update'] } },
      },
      {
        name: 'labels',
        displayName: 'Labels (comma-separated)',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['issue'], issueOperation: ['create', 'update'] } },
      },
      // ── Search (JQL) ──────────────────────────────────────────────────
      {
        name: 'jql',
        displayName: 'JQL Query',
        type: 'string',
        default: 'project = PROJ ORDER BY created DESC',
        description: 'Jira Query Language expression',
        placeholder: 'project = PROJ AND status = "To Do"',
        displayOptions: { show: { resource: ['issue'], issueOperation: ['search'] } },
      },
      {
        name: 'maxResults',
        displayName: 'Max Results',
        type: 'number',
        default: 50,
        description: 'Maximum number of issues to return (max 100)',
        displayOptions: { show: { resource: ['issue'], issueOperation: ['search'] } },
      },
      // ── Comment ───────────────────────────────────────────────────────
      {
        name: 'commentBody',
        displayName: 'Comment Body',
        type: 'string',
        default: '',
        description: 'Comment text (plain text)',
        displayOptions: { show: { resource: ['comment'], commentOperation: ['add', 'update'] } },
      },
      {
        name: 'commentId',
        displayName: 'Comment ID',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['comment'], commentOperation: ['update', 'delete'] } },
      },
      // ── Transition ────────────────────────────────────────────────────
      {
        name: 'transitionId',
        displayName: 'Transition ID',
        type: 'string',
        default: '',
        description: 'Transition ID (get from "List Transitions")',
        displayOptions: { show: { resource: ['transition'], transitionOperation: ['perform'] } },
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    let credentials: Record<string, unknown> = {};
    try { credentials = await context.getCredential('jiraApi'); } catch { /* will error below */ }

    const domain = (credentials['domain'] as string) ?? '';
    const email = (credentials['email'] as string) ?? '';
    const apiToken = (credentials['apiToken'] as string) ?? (credentials['token'] as string) ?? '';

    if (!domain) throw new Error('Jira domain is required in credentials (e.g. "yourcompany.atlassian.net")');
    if (!email || !apiToken) throw new Error('Jira email and API token are required in credentials');

    const baseUrl = `https://${domain.replace(/^https?:\/\//, '').replace(/\/$/, '')}/rest/api/3`;
    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
    const headers: Record<string, string> = {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const jira = async (method: string, path: string, body?: unknown) => {
      return context.helpers.httpRequest({
        url: `${baseUrl}${path}`,
        method: method as 'GET' | 'POST' | 'PUT' | 'DELETE',
        headers,
        body: body as Record<string, unknown>,
      });
    };

    const resource = context.getParameter<string>('resource') ?? 'issue';

    switch (resource) {
      // ── Issues ────────────────────────────────────────────────────────────
      case 'issue': {
        const op = context.getParameter<string>('issueOperation') ?? 'get';

        if (op === 'get') {
          const issueKey = context.getParameter<string>('issueKey') ?? '';
          if (!issueKey) throw new Error('Issue Key is required');
          const data = await jira('GET', `/issue/${encodeURIComponent(issueKey)}`);
          return [{ json: data as Record<string, unknown> }];
        }

        if (op === 'create') {
          const projectKey = context.getParameter<string>('projectKey') ?? '';
          const summary = context.getParameter<string>('summary') ?? '';
          const description = context.getParameter<string>('description') ?? '';
          const issueType = context.getParameter<string>('issueType') ?? 'Task';
          const priority = context.getParameter<string>('priority') ?? 'Medium';
          const assigneeId = context.getParameter<string>('assignee') ?? '';
          const labelsRaw = context.getParameter<string>('labels') ?? '';

          if (!projectKey) throw new Error('Project Key is required');
          if (!summary) throw new Error('Summary is required');

          const fields: Record<string, unknown> = {
            project: { key: projectKey },
            summary,
            issuetype: { name: issueType },
            priority: { name: priority },
            description: {
              type: 'doc',
              version: 1,
              content: [{ type: 'paragraph', content: [{ type: 'text', text: description || '' }] }],
            },
          };
          if (assigneeId) fields['assignee'] = { accountId: assigneeId };
          if (labelsRaw) fields['labels'] = labelsRaw.split(',').map((l) => l.trim()).filter(Boolean);

          const data = await jira('POST', '/issue', { fields });
          return [{ json: data as Record<string, unknown> }];
        }

        if (op === 'update') {
          const issueKey = context.getParameter<string>('issueKey') ?? '';
          if (!issueKey) throw new Error('Issue Key is required');
          const summary = context.getParameter<string>('summary') ?? '';
          const description = context.getParameter<string>('description') ?? '';
          const priority = context.getParameter<string>('priority') ?? '';
          const assigneeId = context.getParameter<string>('assignee') ?? '';
          const labelsRaw = context.getParameter<string>('labels') ?? '';

          const fields: Record<string, unknown> = {};
          if (summary) fields['summary'] = summary;
          if (description) fields['description'] = {
            type: 'doc',
            version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }],
          };
          if (priority) fields['priority'] = { name: priority };
          if (assigneeId) fields['assignee'] = { accountId: assigneeId };
          if (labelsRaw) fields['labels'] = labelsRaw.split(',').map((l) => l.trim()).filter(Boolean);

          await jira('PUT', `/issue/${encodeURIComponent(issueKey)}`, { fields });
          return [{ json: { success: true, issueKey, updated: Object.keys(fields) } }];
        }

        if (op === 'delete') {
          const issueKey = context.getParameter<string>('issueKey') ?? '';
          if (!issueKey) throw new Error('Issue Key is required');
          await jira('DELETE', `/issue/${encodeURIComponent(issueKey)}`);
          return [{ json: { success: true, deleted: true, issueKey } }];
        }

        if (op === 'search') {
          const jql = context.getParameter<string>('jql') ?? '';
          const maxResults = Math.min(context.getParameter<number>('maxResults') ?? 50, 100);
          const data = await jira('POST', '/search', {
            jql,
            maxResults,
            fields: ['summary', 'status', 'assignee', 'priority', 'labels', 'created', 'updated', 'issuetype', 'description'],
          }) as Record<string, unknown>;
          const issues = (data['issues'] as unknown[]) ?? [];
          return issues.map((issue) => ({ json: issue as Record<string, unknown> }));
        }
        break;
      }

      // ── Comments ──────────────────────────────────────────────────────────
      case 'comment': {
        const op = context.getParameter<string>('commentOperation') ?? 'list';
        const issueKey = context.getParameter<string>('issueKey') ?? '';
        if (!issueKey) throw new Error('Issue Key is required');

        if (op === 'list') {
          const data = await jira('GET', `/issue/${encodeURIComponent(issueKey)}/comment`) as Record<string, unknown>;
          const comments = (data['comments'] as unknown[]) ?? [];
          return comments.map((c) => ({ json: c as Record<string, unknown> }));
        }

        if (op === 'add') {
          const body = context.getParameter<string>('commentBody') ?? '';
          if (!body) throw new Error('Comment body is required');
          const data = await jira('POST', `/issue/${encodeURIComponent(issueKey)}/comment`, {
            body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: body }] }] },
          });
          return [{ json: data as Record<string, unknown> }];
        }

        if (op === 'update') {
          const commentId = context.getParameter<string>('commentId') ?? '';
          const body = context.getParameter<string>('commentBody') ?? '';
          if (!commentId) throw new Error('Comment ID is required');
          if (!body) throw new Error('Comment body is required');
          const data = await jira('PUT', `/issue/${encodeURIComponent(issueKey)}/comment/${commentId}`, {
            body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: body }] }] },
          });
          return [{ json: data as Record<string, unknown> }];
        }

        if (op === 'delete') {
          const commentId = context.getParameter<string>('commentId') ?? '';
          if (!commentId) throw new Error('Comment ID is required');
          await jira('DELETE', `/issue/${encodeURIComponent(issueKey)}/comment/${commentId}`);
          return [{ json: { success: true, deleted: true, commentId } }];
        }
        break;
      }

      // ── Transitions ───────────────────────────────────────────────────────
      case 'transition': {
        const op = context.getParameter<string>('transitionOperation') ?? 'list';
        const issueKey = context.getParameter<string>('issueKey') ?? '';
        if (!issueKey) throw new Error('Issue Key is required');

        if (op === 'list') {
          const data = await jira('GET', `/issue/${encodeURIComponent(issueKey)}/transitions`) as Record<string, unknown>;
          const transitions = (data['transitions'] as unknown[]) ?? [];
          return transitions.map((t) => ({ json: t as Record<string, unknown> }));
        }

        if (op === 'perform') {
          const transitionId = context.getParameter<string>('transitionId') ?? '';
          if (!transitionId) throw new Error('Transition ID is required');
          await jira('POST', `/issue/${encodeURIComponent(issueKey)}/transitions`, {
            transition: { id: transitionId },
          });
          return [{ json: { success: true, issueKey, transitionId, transitioned: true } }];
        }
        break;
      }

      // ── Projects ──────────────────────────────────────────────────────────
      case 'project': {
        const op = context.getParameter<string>('projectOperation') ?? 'list';

        if (op === 'list') {
          const data = await jira('GET', '/project/search?maxResults=50') as Record<string, unknown>;
          const projects = (data['values'] as unknown[]) ?? (Array.isArray(data) ? data : []);
          return (projects as unknown[]).map((p) => ({ json: p as Record<string, unknown> }));
        }

        if (op === 'get') {
          const projectKey = context.getParameter<string>('projectKey') ?? '';
          if (!projectKey) throw new Error('Project Key is required');
          const data = await jira('GET', `/project/${encodeURIComponent(projectKey)}`);
          return [{ json: data as Record<string, unknown> }];
        }
        break;
      }
    }

    return [{ json: { success: false, message: 'Unknown operation' } }];
  },
};
