import fs from 'node:fs/promises';
import path from 'node:path';
import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

/**
 * FileOperation node — read, write, append, delete, or list local files.
 * Paths must be absolute or relative to the server's working directory.
 * Security: resolves realpath to prevent traversal; blocks writes outside allowed roots.
 */

/** Allowed root directories. Defaults to CWD. Override via FILE_OP_ROOTS env var (colon-separated). */
function getAllowedRoots(): string[] {
  const envRoots = process.env.FILE_OP_ROOTS;
  if (envRoots) return envRoots.split(path.delimiter).map((r) => path.resolve(r));
  return [process.cwd()];
}

async function safePath(inputPath: string): Promise<string> {
  const resolved = path.resolve(inputPath);
  const roots = getAllowedRoots();
  const allowed = roots.some((root) => resolved.startsWith(root + path.sep) || resolved === root);
  if (!allowed) {
    throw new Error(
      `Path traversal blocked: "${resolved}" is outside allowed roots [${roots.join(', ')}]. ` +
      'Set FILE_OP_ROOTS env var to allow additional directories.',
    );
  }
  return resolved;
}

export const FileOperationNode: INodeType = {
  definition: {
    displayName: 'File Operation',
    name: 'sibercron.fileOperation',
    icon: 'FileText',
    color: '#78716C',
    group: 'core',
    version: 1,
    description: 'Read, write, append, delete, or list local files on the server',
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        name: 'operation',
        displayName: 'Operation',
        type: 'select',
        default: 'read',
        required: true,
        options: [
          { name: 'Read File', value: 'read' },
          { name: 'Write File', value: 'write' },
          { name: 'Append to File', value: 'append' },
          { name: 'Delete File', value: 'delete' },
          { name: 'List Directory', value: 'list' },
          { name: 'File Exists', value: 'exists' },
          { name: 'Move / Rename', value: 'move' },
          { name: 'Get File Info', value: 'stat' },
        ],
      },
      {
        name: 'filePath',
        displayName: 'File Path',
        type: 'string',
        default: '',
        required: true,
        description: 'Absolute or relative path to the file. Expressions supported: {{ $json.path }}',
        displayOptions: {
          show: { operation: ['read', 'write', 'append', 'delete', 'exists', 'move', 'stat'] },
        },
      },
      {
        name: 'dirPath',
        displayName: 'Directory Path',
        type: 'string',
        default: '',
        required: true,
        description: 'Absolute or relative path to the directory to list',
        displayOptions: {
          show: { operation: ['list'] },
        },
      },
      {
        name: 'content',
        displayName: 'Content',
        type: 'string',
        default: '',
        description: 'Content to write/append. Expressions supported: {{ $json.text }}',
        displayOptions: {
          show: { operation: ['write', 'append'] },
        },
      },
      {
        name: 'encoding',
        displayName: 'Encoding',
        type: 'select',
        default: 'utf8',
        options: [
          { name: 'UTF-8 (text)', value: 'utf8' },
          { name: 'Base64', value: 'base64' },
          { name: 'Hex', value: 'hex' },
          { name: 'Binary (latin1)', value: 'latin1' },
        ],
        displayOptions: {
          show: { operation: ['read', 'write', 'append'] },
        },
      },
      {
        name: 'createDirs',
        displayName: 'Create Parent Directories',
        type: 'boolean',
        default: true,
        description: 'Automatically create parent directories if they do not exist (write/append)',
        displayOptions: {
          show: { operation: ['write', 'append'] },
        },
      },
      {
        name: 'destinationPath',
        displayName: 'Destination Path',
        type: 'string',
        default: '',
        required: true,
        description: 'Target path for move/rename operation',
        displayOptions: {
          show: { operation: ['move'] },
        },
      },
      {
        name: 'recursive',
        displayName: 'Recursive',
        type: 'boolean',
        default: false,
        description: 'List directory recursively (list) or delete directory tree (delete)',
        displayOptions: {
          show: { operation: ['list', 'delete'] },
        },
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const operation = context.getParameter<string>('operation');
    const encoding = (context.getParameter<string>('encoding') ?? 'utf8') as BufferEncoding;
    const createDirs = context.getParameter<boolean>('createDirs') ?? true;
    const recursive = context.getParameter<boolean>('recursive') ?? false;

    switch (operation) {
      case 'read': {
        const filePath = await safePath(context.getParameter<string>('filePath'));
        context.helpers.log(`FileOperation: read ${filePath}`);
        const raw = await fs.readFile(filePath);
        const content = encoding === 'base64' ? raw.toString('base64')
          : encoding === 'hex' ? raw.toString('hex')
          : raw.toString(encoding);
        const stat = await fs.stat(filePath);
        return [{ json: { path: filePath, content, encoding, size: stat.size, modifiedAt: stat.mtime.toISOString() } }];
      }

      case 'write': {
        const filePath = await safePath(context.getParameter<string>('filePath'));
        const content = context.getParameter<string>('content') ?? '';
        if (createDirs) await fs.mkdir(path.dirname(filePath), { recursive: true });
        context.helpers.log(`FileOperation: write ${filePath} (${content.length} chars)`);
        await fs.writeFile(filePath, content, encoding);
        const stat = await fs.stat(filePath);
        return [{ json: { path: filePath, success: true, size: stat.size, operation: 'write' } }];
      }

      case 'append': {
        const filePath = await safePath(context.getParameter<string>('filePath'));
        const content = context.getParameter<string>('content') ?? '';
        if (createDirs) await fs.mkdir(path.dirname(filePath), { recursive: true });
        context.helpers.log(`FileOperation: append ${filePath} (${content.length} chars)`);
        await fs.appendFile(filePath, content, encoding);
        const stat = await fs.stat(filePath);
        return [{ json: { path: filePath, success: true, size: stat.size, operation: 'append' } }];
      }

      case 'delete': {
        const filePath = await safePath(context.getParameter<string>('filePath'));
        context.helpers.log(`FileOperation: delete ${filePath}`);
        const stat = await fs.stat(filePath).catch(() => null);
        if (!stat) return [{ json: { path: filePath, success: false, error: 'File not found' } }];
        if (stat.isDirectory()) {
          await fs.rm(filePath, { recursive, force: true });
        } else {
          await fs.unlink(filePath);
        }
        return [{ json: { path: filePath, success: true, operation: 'delete' } }];
      }

      case 'list': {
        const dirPath = await safePath(context.getParameter<string>('dirPath'));
        context.helpers.log(`FileOperation: list ${dirPath} (recursive=${recursive})`);

        async function listDir(dir: string, base: string): Promise<Record<string, unknown>[]> {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          const results: Record<string, unknown>[] = [];
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relPath = path.relative(base, fullPath);
            const stat = await fs.stat(fullPath).catch(() => null);
            results.push({
              name: entry.name,
              path: fullPath,
              relativePath: relPath,
              isDirectory: entry.isDirectory(),
              isFile: entry.isFile(),
              size: stat?.size ?? 0,
              modifiedAt: stat?.mtime?.toISOString() ?? null,
            });
            if (recursive && entry.isDirectory()) {
              results.push(...await listDir(fullPath, base));
            }
          }
          return results;
        }

        const entries = await listDir(dirPath, dirPath);
        return entries.length > 0
          ? entries.map((e) => ({ json: e }))
          : [{ json: { path: dirPath, entries: [], count: 0 } }];
      }

      case 'exists': {
        const filePath = await safePath(context.getParameter<string>('filePath'));
        const stat = await fs.stat(filePath).catch(() => null);
        return [{ json: { path: filePath, exists: stat !== null, isFile: stat?.isFile() ?? false, isDirectory: stat?.isDirectory() ?? false } }];
      }

      case 'move': {
        const filePath = await safePath(context.getParameter<string>('filePath'));
        const destPath = await safePath(context.getParameter<string>('destinationPath'));
        context.helpers.log(`FileOperation: move ${filePath} → ${destPath}`);
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        await fs.rename(filePath, destPath);
        return [{ json: { source: filePath, destination: destPath, success: true, operation: 'move' } }];
      }

      case 'stat': {
        const filePath = await safePath(context.getParameter<string>('filePath'));
        const stat = await fs.stat(filePath);
        return [{
          json: {
            path: filePath,
            size: stat.size,
            isFile: stat.isFile(),
            isDirectory: stat.isDirectory(),
            createdAt: stat.birthtime.toISOString(),
            modifiedAt: stat.mtime.toISOString(),
            accessedAt: stat.atime.toISOString(),
            mode: stat.mode.toString(8),
          },
        }];
      }

      default:
        throw new Error(`Unknown file operation: ${operation}`);
    }
  },
};
