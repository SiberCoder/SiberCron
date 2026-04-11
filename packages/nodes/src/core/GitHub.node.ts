import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

/**
 * GitHub node — interacts with the GitHub REST API v3.
 * Supports: issues, pull requests, repository info, releases, and comments.
 * Auth: Personal Access Token (PAT) or OAuth token via credential.
 */
export const GitHubNode: INodeType = {
  definition: {
    displayName: 'GitHub',
    name: 'sibercron.github',
    icon: 'Github',
    color: '#24292E',
    group: 'data',
    version: 1,
    description: 'Interact with GitHub — issues, PRs, repositories, releases',
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      { name: 'githubApi', required: true, displayName: 'GitHub API Token' },
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
          { name: 'Pull Request', value: 'pullRequest' },
          { name: 'Repository', value: 'repository' },
          { name: 'Release', value: 'release' },
          { name: 'Comment', value: 'comment' },
        ],
      },
      // ── Common ─────────────────────────────────────────────────────
      {
        name: 'owner',
        displayName: 'Repository Owner',
        type: 'string',
        default: '',
        required: true,
        description: 'GitHub username or organization (e.g. "octocat")',
        placeholder: 'octocat',
      },
      {
        name: 'repo',
        displayName: 'Repository Name',
        type: 'string',
        default: '',
        required: true,
        description: 'Repository name (e.g. "hello-world")',
        placeholder: 'hello-world',
      },
      // ── Issue operations ──────────────────────────────────────────
      {
        name: 'issueOperation',
        displayName: 'Operation',
        type: 'select',
        default: 'list',
        options: [
          { name: 'List Issues', value: 'list' },
          { name: 'Get Issue', value: 'get' },
          { name: 'Create Issue', value: 'create' },
          { name: 'Update Issue', value: 'update' },
          { name: 'Close Issue', value: 'close' },
          { name: 'Lock Issue', value: 'lock' },
        ],
        displayOptions: { show: { resource: ['issue'] } },
      },
      // ── PR operations ─────────────────────────────────────────────
      {
        name: 'prOperation',
        displayName: 'Operation',
        type: 'select',
        default: 'list',
        options: [
          { name: 'List Pull Requests', value: 'list' },
          { name: 'Get Pull Request', value: 'get' },
          { name: 'Create Pull Request', value: 'create' },
          { name: 'Merge Pull Request', value: 'merge' },
          { name: 'List PR Reviews', value: 'listReviews' },
        ],
        displayOptions: { show: { resource: ['pullRequest'] } },
      },
      // ── Repo operations ───────────────────────────────────────────
      {
        name: 'repoOperation',
        displayName: 'Operation',
        type: 'select',
        default: 'get',
        options: [
          { name: 'Get Repository', value: 'get' },
          { name: 'List Branches', value: 'listBranches' },
          { name: 'List Contributors', value: 'listContributors' },
          { name: 'List Tags', value: 'listTags' },
          { name: 'Get README', value: 'getReadme' },
        ],
        displayOptions: { show: { resource: ['repository'] } },
      },
      // ── Release operations ────────────────────────────────────────
      {
        name: 'releaseOperation',
        displayName: 'Operation',
        type: 'select',
        default: 'list',
        options: [
          { name: 'List Releases', value: 'list' },
          { name: 'Get Latest Release', value: 'getLatest' },
          { name: 'Create Release', value: 'create' },
        ],
        displayOptions: { show: { resource: ['release'] } },
      },
      // ── Comment operations ────────────────────────────────────────
      {
        name: 'commentOperation',
        displayName: 'Operation',
        type: 'select',
        default: 'list',
        options: [
          { name: 'List Issue Comments', value: 'list' },
          { name: 'Create Comment', value: 'create' },
          { name: 'Delete Comment', value: 'delete' },
        ],
        displayOptions: { show: { resource: ['comment'] } },
      },
      // ── Number (issue/PR/comment) ─────────────────────────────────
      {
        name: 'number',
        displayName: 'Issue / PR Number',
        type: 'number',
        default: 1,
        description: 'Issue or PR number',
        displayOptions: {
          show: {
            resource: ['issue', 'pullRequest', 'comment'],
            issueOperation: ['get', 'update', 'close', 'lock'],
            prOperation: ['get', 'merge', 'listReviews'],
            commentOperation: ['list', 'create'],
          },
        },
      },
      {
        name: 'commentId',
        displayName: 'Comment ID',
        type: 'number',
        default: 0,
        description: 'Numeric ID of the comment to delete',
        displayOptions: { show: { resource: ['comment'], commentOperation: ['delete'] } },
      },
      // ── Create/Update issue fields ────────────────────────────────
      {
        name: 'title',
        displayName: 'Title',
        type: 'string',
        default: '',
        description: 'Title for the issue, PR, or release',
        displayOptions: {
          show: {
            resource: ['issue', 'pullRequest', 'release'],
            issueOperation: ['create', 'update'],
            prOperation: ['create'],
            releaseOperation: ['create'],
          },
        },
      },
      {
        name: 'body',
        displayName: 'Body / Description',
        type: 'string',
        default: '',
        description: 'Markdown body for the issue, PR, comment, or release',
        displayOptions: {
          show: {
            resource: ['issue', 'pullRequest', 'release', 'comment'],
            issueOperation: ['create', 'update'],
            prOperation: ['create'],
            releaseOperation: ['create'],
            commentOperation: ['create'],
          },
        },
      },
      {
        name: 'labels',
        displayName: 'Labels (comma-separated)',
        type: 'string',
        default: '',
        description: 'Comma-separated list of label names to apply',
        displayOptions: {
          show: { resource: ['issue'], issueOperation: ['create', 'update'] },
        },
      },
      {
        name: 'assignees',
        displayName: 'Assignees (comma-separated usernames)',
        type: 'string',
        default: '',
        displayOptions: {
          show: { resource: ['issue'], issueOperation: ['create', 'update'] },
        },
      },
      // ── PR-specific fields ────────────────────────────────────────
      {
        name: 'head',
        displayName: 'Head Branch',
        type: 'string',
        default: '',
        description: 'Branch with changes (e.g. "feature/my-feature")',
        displayOptions: { show: { resource: ['pullRequest'], prOperation: ['create'] } },
      },
      {
        name: 'base',
        displayName: 'Base Branch',
        type: 'string',
        default: 'main',
        description: 'Target branch to merge into (e.g. "main")',
        displayOptions: { show: { resource: ['pullRequest'], prOperation: ['create', 'merge'] } },
      },
      {
        name: 'mergeMethod',
        displayName: 'Merge Method',
        type: 'select',
        default: 'merge',
        options: [
          { name: 'Merge commit', value: 'merge' },
          { name: 'Squash and merge', value: 'squash' },
          { name: 'Rebase and merge', value: 'rebase' },
        ],
        displayOptions: { show: { resource: ['pullRequest'], prOperation: ['merge'] } },
      },
      // ── Release fields ────────────────────────────────────────────
      {
        name: 'tagName',
        displayName: 'Tag Name',
        type: 'string',
        default: '',
        description: 'Git tag for the release (e.g. "v1.2.0")',
        displayOptions: { show: { resource: ['release'], releaseOperation: ['create'] } },
      },
      {
        name: 'isDraft',
        displayName: 'Draft Release',
        type: 'boolean',
        default: false,
        displayOptions: { show: { resource: ['release'], releaseOperation: ['create'] } },
      },
      {
        name: 'isPrerelease',
        displayName: 'Pre-release',
        type: 'boolean',
        default: false,
        displayOptions: { show: { resource: ['release'], releaseOperation: ['create'] } },
      },
      // ── List filters ──────────────────────────────────────────────
      {
        name: 'state',
        displayName: 'State Filter',
        type: 'select',
        default: 'open',
        options: [
          { name: 'Open', value: 'open' },
          { name: 'Closed', value: 'closed' },
          { name: 'All', value: 'all' },
        ],
        displayOptions: {
          show: {
            resource: ['issue', 'pullRequest'],
            issueOperation: ['list'],
            prOperation: ['list'],
          },
        },
      },
      {
        name: 'limit',
        displayName: 'Max Results',
        type: 'number',
        default: 30,
        description: 'Maximum number of items to return (max 100)',
        displayOptions: {
          show: {
            resource: ['issue', 'pullRequest', 'repository', 'release'],
            issueOperation: ['list'],
            prOperation: ['list'],
            repoOperation: ['listBranches', 'listContributors', 'listTags'],
            releaseOperation: ['list'],
          },
        },
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const resource = context.getParameter<string>('resource') ?? 'issue';
    const owner = context.getParameter<string>('owner') ?? '';
    const repo = context.getParameter<string>('repo') ?? '';

    if (!owner || !repo) throw new Error('Repository owner and name are required');

    let credentials: Record<string, unknown> = {};
    try { credentials = await context.getCredential('githubApi'); } catch { /* optional */ }
    const token = (credentials['token'] as string) ?? (credentials['apiKey'] as string) ?? '';

    const baseUrl = 'https://api.github.com';
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'SiberCron/1.0',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const gh = async (method: string, path: string, body?: unknown) => {
      const result = await context.helpers.httpRequest({
        url: `${baseUrl}${path}`,
        method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        headers,
        body: body as Record<string, unknown>,
      }) as unknown;
      return result;
    };

    const repoBase = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const limit = Math.min(context.getParameter<number>('limit') ?? 30, 100);

    context.helpers.log(`GitHub: resource=${resource} owner=${owner} repo=${repo}`);

    switch (resource) {
      // ── Issues ──────────────────────────────────────────────────────────
      case 'issue': {
        const op = context.getParameter<string>('issueOperation') ?? 'list';
        const number = context.getParameter<number>('number') ?? 1;

        if (op === 'list') {
          const state = context.getParameter<string>('state') ?? 'open';
          const data = await gh('GET', `${repoBase}/issues?state=${state}&per_page=${limit}&type=issues`) as unknown[];
          return (Array.isArray(data) ? data : []).map((item) => ({ json: item as Record<string, unknown> }));
        }

        if (op === 'get') {
          const data = await gh('GET', `${repoBase}/issues/${number}`);
          return [{ json: data as Record<string, unknown> }];
        }

        if (op === 'create') {
          const title = context.getParameter<string>('title') ?? '';
          const body = context.getParameter<string>('body') ?? '';
          const labelsRaw = context.getParameter<string>('labels') ?? '';
          const assigneesRaw = context.getParameter<string>('assignees') ?? '';
          if (!title) throw new Error('Title is required for creating an issue');
          const payload: Record<string, unknown> = { title, body };
          if (labelsRaw) payload['labels'] = labelsRaw.split(',').map((l) => l.trim()).filter(Boolean);
          if (assigneesRaw) payload['assignees'] = assigneesRaw.split(',').map((a) => a.trim()).filter(Boolean);
          const data = await gh('POST', `${repoBase}/issues`, payload);
          return [{ json: data as Record<string, unknown> }];
        }

        if (op === 'update') {
          const title = context.getParameter<string>('title') ?? '';
          const body = context.getParameter<string>('body') ?? '';
          const labelsRaw = context.getParameter<string>('labels') ?? '';
          const payload: Record<string, unknown> = {};
          if (title) payload['title'] = title;
          if (body) payload['body'] = body;
          if (labelsRaw) payload['labels'] = labelsRaw.split(',').map((l) => l.trim()).filter(Boolean);
          const data = await gh('PATCH', `${repoBase}/issues/${number}`, payload);
          return [{ json: data as Record<string, unknown> }];
        }

        if (op === 'close') {
          const data = await gh('PATCH', `${repoBase}/issues/${number}`, { state: 'closed' });
          return [{ json: data as Record<string, unknown> }];
        }

        if (op === 'lock') {
          await gh('PUT', `${repoBase}/issues/${number}/lock`, { lock_reason: 'resolved' });
          return [{ json: { success: true, number, locked: true } }];
        }
        break;
      }

      // ── Pull Requests ────────────────────────────────────────────────────
      case 'pullRequest': {
        const op = context.getParameter<string>('prOperation') ?? 'list';
        const number = context.getParameter<number>('number') ?? 1;

        if (op === 'list') {
          const state = context.getParameter<string>('state') ?? 'open';
          const data = await gh('GET', `${repoBase}/pulls?state=${state}&per_page=${limit}`) as unknown[];
          return (Array.isArray(data) ? data : []).map((item) => ({ json: item as Record<string, unknown> }));
        }

        if (op === 'get') {
          const data = await gh('GET', `${repoBase}/pulls/${number}`);
          return [{ json: data as Record<string, unknown> }];
        }

        if (op === 'create') {
          const title = context.getParameter<string>('title') ?? '';
          const body = context.getParameter<string>('body') ?? '';
          const head = context.getParameter<string>('head') ?? '';
          const base = context.getParameter<string>('base') ?? 'main';
          if (!title || !head) throw new Error('Title and head branch are required for creating a PR');
          const data = await gh('POST', `${repoBase}/pulls`, { title, body, head, base });
          return [{ json: data as Record<string, unknown> }];
        }

        if (op === 'merge') {
          const mergeMethod = context.getParameter<string>('mergeMethod') ?? 'merge';
          const data = await gh('PUT', `${repoBase}/pulls/${number}/merge`, { merge_method: mergeMethod });
          return [{ json: data as Record<string, unknown> }];
        }

        if (op === 'listReviews') {
          const data = await gh('GET', `${repoBase}/pulls/${number}/reviews`) as unknown[];
          return (Array.isArray(data) ? data : []).map((item) => ({ json: item as Record<string, unknown> }));
        }
        break;
      }

      // ── Repository ───────────────────────────────────────────────────────
      case 'repository': {
        const op = context.getParameter<string>('repoOperation') ?? 'get';

        if (op === 'get') {
          const data = await gh('GET', repoBase);
          return [{ json: data as Record<string, unknown> }];
        }

        if (op === 'listBranches') {
          const data = await gh('GET', `${repoBase}/branches?per_page=${limit}`) as unknown[];
          return (Array.isArray(data) ? data : []).map((item) => ({ json: item as Record<string, unknown> }));
        }

        if (op === 'listContributors') {
          const data = await gh('GET', `${repoBase}/contributors?per_page=${limit}`) as unknown[];
          return (Array.isArray(data) ? data : []).map((item) => ({ json: item as Record<string, unknown> }));
        }

        if (op === 'listTags') {
          const data = await gh('GET', `${repoBase}/tags?per_page=${limit}`) as unknown[];
          return (Array.isArray(data) ? data : []).map((item) => ({ json: item as Record<string, unknown> }));
        }

        if (op === 'getReadme') {
          const data = await gh('GET', `${repoBase}/readme`);
          return [{ json: data as Record<string, unknown> }];
        }
        break;
      }

      // ── Releases ─────────────────────────────────────────────────────────
      case 'release': {
        const op = context.getParameter<string>('releaseOperation') ?? 'list';

        if (op === 'list') {
          const data = await gh('GET', `${repoBase}/releases?per_page=${limit}`) as unknown[];
          return (Array.isArray(data) ? data : []).map((item) => ({ json: item as Record<string, unknown> }));
        }

        if (op === 'getLatest') {
          const data = await gh('GET', `${repoBase}/releases/latest`);
          return [{ json: data as Record<string, unknown> }];
        }

        if (op === 'create') {
          const tag_name = context.getParameter<string>('tagName') ?? '';
          const name = context.getParameter<string>('title') ?? tag_name;
          const body = context.getParameter<string>('body') ?? '';
          const draft = context.getParameter<boolean>('isDraft') ?? false;
          const prerelease = context.getParameter<boolean>('isPrerelease') ?? false;
          if (!tag_name) throw new Error('Tag name is required for creating a release');
          const data = await gh('POST', `${repoBase}/releases`, { tag_name, name, body, draft, prerelease });
          return [{ json: data as Record<string, unknown> }];
        }
        break;
      }

      // ── Comments ─────────────────────────────────────────────────────────
      case 'comment': {
        const op = context.getParameter<string>('commentOperation') ?? 'list';
        const number = context.getParameter<number>('number') ?? 1;

        if (op === 'list') {
          const data = await gh('GET', `${repoBase}/issues/${number}/comments?per_page=${limit}`) as unknown[];
          return (Array.isArray(data) ? data : []).map((item) => ({ json: item as Record<string, unknown> }));
        }

        if (op === 'create') {
          const body = context.getParameter<string>('body') ?? '';
          if (!body) throw new Error('Body is required for creating a comment');
          const data = await gh('POST', `${repoBase}/issues/${number}/comments`, { body });
          return [{ json: data as Record<string, unknown> }];
        }

        if (op === 'delete') {
          const commentId = context.getParameter<number>('commentId') ?? 0;
          if (!commentId) throw new Error('Comment ID is required');
          await gh('DELETE', `${repoBase}/issues/comments/${commentId}`);
          return [{ json: { success: true, deleted: true, commentId } }];
        }
        break;
      }
    }

    return [{ json: { success: false, message: 'Unknown operation' } }];
  },
};
