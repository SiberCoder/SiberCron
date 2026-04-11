import { createSign } from 'node:crypto';
import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

// ── Google Service Account JWT helper (same pattern as GoogleSheets) ─────────

async function getGoogleAccessToken(clientEmail: string, privateKey: string, scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = { iss: clientEmail, scope, aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now };

  const b64 = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const sigInput = `${b64(header)}.${b64(payload)}`;

  const normalizedKey = privateKey
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '-----BEGIN PRIVATE KEY-----\n')
    .replace(/-----END PRIVATE KEY-----/g, '\n-----END PRIVATE KEY-----')
    .replace(/\n{2,}/g, '\n');

  const sign = createSign('RSA-SHA256');
  sign.update(sigInput);
  const signature = sign.sign(normalizedKey, 'base64url');
  const jwt = `${sigInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  if (!res.ok) throw new Error(`Google OAuth token error: ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

// ── Drive API helpers ─────────────────────────────────────────────────────────

const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

async function driveReq(token: string, path: string, opts: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${DRIVE_BASE}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers as Record<string, string> ?? {}) },
  });
  if (!res.ok) throw new Error(`Drive API ${opts.method ?? 'GET'} ${path} → ${res.status}: ${await res.text()}`);
  if (res.status === 204) return {};
  return res.json();
}

// ── Node definition ───────────────────────────────────────────────────────────

export const GoogleDriveNode: INodeType = {
  definition: {
    displayName: 'Google Drive',
    name: 'sibercron.googleDrive',
    icon: 'HardDrive',
    color: '#4285F4',
    group: 'data',
    version: 1,
    description: 'Manage files and folders in Google Drive',
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      {
        name: 'googleServiceAccount',
        required: true,
        displayName: 'Google Service Account',
      },
    ],
    properties: [
      {
        name: 'operation',
        displayName: 'Operation',
        type: 'select',
        default: 'listFiles',
        options: [
          { name: 'List Files', value: 'listFiles' },
          { name: 'Get File', value: 'getFile' },
          { name: 'Download File', value: 'downloadFile' },
          { name: 'Upload File', value: 'uploadFile' },
          { name: 'Create Folder', value: 'createFolder' },
          { name: 'Move File', value: 'moveFile' },
          { name: 'Copy File', value: 'copyFile' },
          { name: 'Delete File', value: 'deleteFile' },
          { name: 'Share File', value: 'shareFile' },
        ],
      },
      {
        name: 'fileId',
        displayName: 'File / Folder ID',
        type: 'string',
        default: '',
        description: 'Google Drive file or folder ID',
        placeholder: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms',
      },
      {
        name: 'folderId',
        displayName: 'Parent Folder ID',
        type: 'string',
        default: '',
        description: 'Parent folder ID (leave empty for root). Used in List, Upload, Create Folder.',
      },
      {
        name: 'fileName',
        displayName: 'File Name',
        type: 'string',
        default: '',
        description: 'Name for the file or folder to create/upload',
      },
      {
        name: 'fileContent',
        displayName: 'File Content',
        type: 'string',
        default: '',
        description: 'Content to upload (text or base64 for binary files)',
      },
      {
        name: 'mimeType',
        displayName: 'MIME Type',
        type: 'string',
        default: 'text/plain',
        description: 'MIME type of the file being uploaded (e.g. text/plain, application/json, image/png)',
      },
      {
        name: 'contentEncoding',
        displayName: 'Content Encoding',
        type: 'select',
        default: 'text',
        options: [
          { name: 'Plain Text', value: 'text' },
          { name: 'Base64 (binary)', value: 'base64' },
        ],
      },
      {
        name: 'query',
        displayName: 'Search Query',
        type: 'string',
        default: '',
        description: "Drive query filter (e.g. \"name contains 'report'\")",
        placeholder: "name contains 'report' and mimeType != 'application/vnd.google-apps.folder'",
      },
      {
        name: 'maxResults',
        displayName: 'Max Results',
        type: 'number',
        default: 50,
        description: 'Maximum number of files to return when listing',
      },
      {
        name: 'targetFolderId',
        displayName: 'Target Folder ID',
        type: 'string',
        default: '',
        description: 'Destination folder for Move / Copy operations',
      },
      {
        name: 'shareEmail',
        displayName: 'Share With (email)',
        type: 'string',
        default: '',
        description: 'Email address to share the file with',
      },
      {
        name: 'shareRole',
        displayName: 'Permission Role',
        type: 'select',
        default: 'reader',
        options: [
          { name: 'Viewer', value: 'reader' },
          { name: 'Commenter', value: 'commenter' },
          { name: 'Editor', value: 'writer' },
        ],
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const operation = context.getParameter('operation') as string ?? 'listFiles';
    const fileId = context.getParameter('fileId') as string ?? '';
    const folderId = context.getParameter('folderId') as string ?? '';
    const fileName = context.getParameter('fileName') as string ?? '';
    const fileContent = context.getParameter('fileContent') as string ?? '';
    const mimeType = context.getParameter('mimeType') as string ?? 'text/plain';
    const contentEncoding = context.getParameter('contentEncoding') as string ?? 'text';
    const query = context.getParameter('query') as string ?? '';
    const maxResults = context.getParameter('maxResults') as number ?? 50;
    const targetFolderId = context.getParameter('targetFolderId') as string ?? '';
    const shareEmail = context.getParameter('shareEmail') as string ?? '';
    const shareRole = context.getParameter('shareRole') as string ?? 'reader';

    const cred = await context.getCredential('googleServiceAccount');
    const token = await getGoogleAccessToken(
      cred.clientEmail as string,
      cred.privateKey as string,
      'https://www.googleapis.com/auth/drive',
    );

    const fields = 'id,name,mimeType,size,createdTime,modifiedTime,parents,webViewLink,webContentLink,owners,shared,trashed';

    switch (operation) {
      case 'listFiles': {
        const params = new URLSearchParams({
          pageSize: String(Math.min(maxResults, 1000)),
          fields: `files(${fields}),nextPageToken`,
          orderBy: 'modifiedTime desc',
        });
        if (folderId) params.set('q', `'${folderId}' in parents and trashed=false${query ? ` and ${query}` : ''}`);
        else if (query) params.set('q', `${query} and trashed=false`);
        else params.set('q', 'trashed=false');

        const data = await driveReq(token, `/files?${params}`) as { files: Record<string, unknown>[] };
        return (data.files ?? []).map(f => ({ json: f }));
      }

      case 'getFile': {
        if (!fileId) throw new Error('File ID is required for getFile');
        const data = await driveReq(token, `/files/${fileId}?fields=${fields}`);
        return [{ json: data as Record<string, unknown> }];
      }

      case 'downloadFile': {
        if (!fileId) throw new Error('File ID is required for downloadFile');
        // Check if it's a Google Docs file (needs export)
        const meta = await driveReq(token, `/files/${fileId}?fields=mimeType,name`) as { mimeType: string; name: string };
        let downloadUrl: string;
        if (meta.mimeType.startsWith('application/vnd.google-apps.')) {
          // Export Google Docs formats
          const exportMime = meta.mimeType === 'application/vnd.google-apps.spreadsheet'
            ? 'text/csv'
            : meta.mimeType === 'application/vnd.google-apps.presentation'
              ? 'application/pdf'
              : 'text/plain';
          downloadUrl = `${DRIVE_BASE}/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`;
        } else {
          downloadUrl = `${DRIVE_BASE}/files/${fileId}?alt=media`;
        }
        const res = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(`Download failed: ${res.status} ${await res.text()}`);
        const buf = Buffer.from(await res.arrayBuffer());
        return [{ json: { fileId, name: meta.name, mimeType: meta.mimeType, content: buf.toString('base64'), size: buf.length } }];
      }

      case 'uploadFile': {
        if (!fileName) throw new Error('File Name is required for uploadFile');
        const buf = contentEncoding === 'base64' ? Buffer.from(fileContent, 'base64') : Buffer.from(fileContent, 'utf8');
        const metadata: Record<string, unknown> = { name: fileName, mimeType };
        if (folderId) metadata.parents = [folderId];

        const boundary = '-------314159265358979323846';
        const delimiter = `\r\n--${boundary}\r\n`;
        const closeDelimiter = `\r\n--${boundary}--`;
        const metaPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
        const mediaPart = `${delimiter}Content-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n${buf.toString('base64')}`;
        const body = metaPart + mediaPart + closeDelimiter;

        const res = await fetch(`${UPLOAD_BASE}/files?uploadType=multipart&fields=${fields}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary="${boundary}"`,
          },
          body,
        });
        if (!res.ok) throw new Error(`Upload failed: ${res.status}: ${await res.text()}`);
        return [{ json: await res.json() as Record<string, unknown> }];
      }

      case 'createFolder': {
        if (!fileName) throw new Error('Folder Name is required for createFolder');
        const metadata: Record<string, unknown> = { name: fileName, mimeType: 'application/vnd.google-apps.folder' };
        if (folderId) metadata.parents = [folderId];
        const data = await driveReq(token, `/files?fields=${fields}`, {
          method: 'POST',
          body: JSON.stringify(metadata),
        });
        return [{ json: data as Record<string, unknown> }];
      }

      case 'moveFile': {
        if (!fileId) throw new Error('File ID is required for moveFile');
        if (!targetFolderId) throw new Error('Target Folder ID is required for moveFile');
        // Get current parents first
        const meta = await driveReq(token, `/files/${fileId}?fields=parents`) as { parents: string[] };
        const removeParents = (meta.parents ?? []).join(',');
        const params = new URLSearchParams({ addParents: targetFolderId, removeParents, fields });
        const data = await driveReq(token, `/files/${fileId}?${params}`, { method: 'PATCH', body: '{}' });
        return [{ json: data as Record<string, unknown> }];
      }

      case 'copyFile': {
        if (!fileId) throw new Error('File ID is required for copyFile');
        const body: Record<string, unknown> = {};
        if (fileName) body.name = fileName;
        if (targetFolderId) body.parents = [targetFolderId];
        const data = await driveReq(token, `/files/${fileId}/copy?fields=${fields}`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        return [{ json: data as Record<string, unknown> }];
      }

      case 'deleteFile': {
        if (!fileId) throw new Error('File ID is required for deleteFile');
        await driveReq(token, `/files/${fileId}`, { method: 'DELETE' });
        return [{ json: { fileId, deleted: true } }];
      }

      case 'shareFile': {
        if (!fileId) throw new Error('File ID is required for shareFile');
        if (!shareEmail) throw new Error('Share email is required for shareFile');
        const perm = await driveReq(token, `/files/${fileId}/permissions?fields=id,role,type,emailAddress`, {
          method: 'POST',
          body: JSON.stringify({ role: shareRole, type: 'user', emailAddress: shareEmail }),
        });
        return [{ json: { fileId, permission: perm } }];
      }

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  },
};
