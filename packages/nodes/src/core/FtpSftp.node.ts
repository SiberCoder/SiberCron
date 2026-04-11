import type { INodeType, INodeTypeDefinition, IExecutionContext, INodeExecutionData } from '@sibercron/shared';
import * as ftp from 'basic-ftp';

/* ------------------------------------------------------------------ */
/*  FTP/SFTP node — dosya transfer işlemleri                          */
/* ------------------------------------------------------------------ */

export const FtpSftpNode: INodeType = {
  definition: {
    name: 'sibercron.ftpSftp',
    displayName: 'FTP / SFTP',
    description: 'FTP veya SFTP sunucusunda dosya işlemleri: listele, indir, yükle, sil, yeniden adlandır',
    icon: 'HardDrive',
    group: 'data',
    version: 1,
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      {
        name: 'ftpSftp',
        required: true,
      },
    ],
    properties: [
      {
        name: 'protocol',
        displayName: 'Protokol',
        type: 'options',
        options: [
          { name: 'FTP', value: 'ftp' },
          { name: 'FTPS (TLS)', value: 'ftps' },
          { name: 'SFTP (SSH)', value: 'sftp' },
        ],
        default: 'sftp',
        required: true,
      },
      {
        name: 'operation',
        displayName: 'İşlem',
        type: 'options',
        options: [
          { name: 'Listele (list)', value: 'list' },
          { name: 'İndir (download)', value: 'download' },
          { name: 'Yükle (upload)', value: 'upload' },
          { name: 'Sil (delete)', value: 'delete' },
          { name: 'Yeniden Adlandır (rename)', value: 'rename' },
          { name: 'Dizin Oluştur (mkdir)', value: 'mkdir' },
        ],
        default: 'list',
        required: true,
      },
      {
        name: 'remotePath',
        displayName: 'Uzak Yol',
        type: 'string',
        default: '/',
        description: 'Uzak sunucudaki dizin veya dosya yolu',
        required: true,
      },
      {
        name: 'newPath',
        displayName: 'Yeni Yol (rename için)',
        type: 'string',
        default: '',
        description: 'Rename işleminde hedef yol',
      },
      {
        name: 'content',
        displayName: 'Dosya İçeriği (upload için)',
        type: 'string',
        default: '',
        description: 'Yüklenecek dosyanın içeriği (metin veya base64)',
      },
      {
        name: 'encoding',
        displayName: 'Kodlama',
        type: 'options',
        options: [
          { name: 'UTF-8 (metin)', value: 'utf8' },
          { name: 'Base64 (binary)', value: 'base64' },
        ],
        default: 'utf8',
      },
      {
        name: 'maxSizeMB',
        displayName: 'Maksimum İndirme Boyutu (MB)',
        type: 'number',
        default: 50,
        description: 'Bu boyutu aşan dosyalar indirilmez. 0 = sınırsız (dikkatli kullanın).',
      },
    ],
  } as INodeTypeDefinition,

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const protocol = context.getParameter('protocol') as string ?? 'sftp';
    const operation = context.getParameter('operation') as string ?? 'list';
    const remotePath = context.getParameter('remotePath') as string ?? '/';
    const newPath = context.getParameter('newPath') as string ?? '';
    const content = context.getParameter('content') as string ?? '';
    const encoding = context.getParameter('encoding') as string ?? 'utf8';
    const maxSizeMB = (context.getParameter('maxSizeMB') as number) ?? 50;
    const maxSizeBytes = maxSizeMB > 0 ? maxSizeMB * 1024 * 1024 : Infinity;

    const creds = await context.getCredential('ftpSftp') as {
      host: string;
      port?: number;
      username?: string;
      user?: string;
      password?: string;
      privateKey?: string;
    };

    if (!creds?.host) {
      throw new Error('FTP/SFTP kimlik bilgileri eksik: host gerekli');
    }

    const host = creds.host;
    const port = creds.port ?? (protocol === 'sftp' ? 22 : 21);
    const username = creds.username ?? creds.user ?? 'anonymous';
    const password = creds.password ?? '';

    if (protocol === 'sftp') {
      return await executeSftp(operation, { host, port, username, password, privateKey: creds.privateKey }, remotePath, newPath, content, encoding, maxSizeBytes);
    } else {
      return await executeFtp(operation, { host, port, user: username, password, secure: protocol === 'ftps' }, remotePath, newPath, content, encoding, maxSizeBytes);
    }
  },
};

/* ------------------------------------------------------------------ */
/*  FTP operations using basic-ftp                                     */
/* ------------------------------------------------------------------ */

async function executeFtp(
  operation: string,
  config: { host: string; port: number; user: string; password: string; secure: boolean },
  remotePath: string,
  newPath: string,
  content: string,
  encoding: string,
  maxSizeBytes = Infinity,
): Promise<INodeExecutionData[]> {
  const client = new ftp.Client(30000);
  client.ftp.verbose = false;

  try {
    await client.access({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      secure: config.secure,
      secureOptions: config.secure ? { rejectUnauthorized: false } : undefined,
    });

    switch (operation) {
      case 'list': {
        const files = await client.list(remotePath);
        return files.map((f) => ({
          json: {
            name: f.name,
            type: f.type === ftp.FileType.Directory ? 'directory' : 'file',
            size: f.size,
            modifiedAt: f.modifiedAt?.toISOString(),
            rawModifiedAt: f.rawModifiedAt,
            permissions: f.permissions,
          },
        }));
      }

      case 'download': {
        // Check file size before downloading to avoid loading huge files into memory
        if (maxSizeBytes !== Infinity) {
          try {
            const fileSize = await client.size(remotePath);
            if (fileSize > maxSizeBytes) {
              const sizeMB = (fileSize / 1024 / 1024).toFixed(1);
              const limitMB = (maxSizeBytes / 1024 / 1024).toFixed(0);
              throw new Error(
                `Dosya çok büyük: ${sizeMB}MB (limit: ${limitMB}MB). ` +
                `"Maksimum İndirme Boyutu" değerini artırın veya 0 yaparak sınırsız indirmeyi etkinleştirin.`
              );
            }
          } catch (e) {
            // If stat fails (e.g., server doesn't support SIZE), proceed anyway
            if ((e as Error).message?.includes('Dosya çok büyük')) throw e;
          }
        }
        const { Writable } = await import('node:stream');
        const chunks: Buffer[] = [];
        const writable = new Writable({
          write(chunk: Buffer, _enc, cb) {
            chunks.push(chunk);
            cb();
          },
        });
        await client.downloadTo(writable, remotePath);
        const buf = Buffer.concat(chunks);
        const result = encoding === 'base64' ? buf.toString('base64') : buf.toString('utf8');
        return [{ json: { path: remotePath, content: result, encoding, size: buf.length } }];
      }

      case 'upload': {
        const { Readable } = await import('node:stream');
        const buf = encoding === 'base64' ? Buffer.from(content, 'base64') : Buffer.from(content, 'utf8');
        const readable = Readable.from(buf);
        await client.uploadFrom(readable, remotePath);
        return [{ json: { path: remotePath, uploaded: true, size: buf.length } }];
      }

      case 'delete': {
        await client.remove(remotePath);
        return [{ json: { path: remotePath, deleted: true } }];
      }

      case 'rename': {
        if (!newPath) throw new Error('Yeniden adlandırmak için yeni yol belirtilmeli');
        await client.rename(remotePath, newPath);
        return [{ json: { oldPath: remotePath, newPath, renamed: true } }];
      }

      case 'mkdir': {
        await client.ensureDir(remotePath);
        return [{ json: { path: remotePath, created: true } }];
      }

      default:
        throw new Error(`Bilinmeyen işlem: ${operation}`);
    }
  } finally {
    client.close();
  }
}

/* ------------------------------------------------------------------ */
/*  SFTP operations using ssh2-sftp-client                            */
/* ------------------------------------------------------------------ */

async function executeSftp(
  operation: string,
  config: { host: string; port: number; username: string; password: string; privateKey?: string },
  remotePath: string,
  newPath: string,
  content: string,
  encoding: string,
  maxSizeBytes = Infinity,
): Promise<INodeExecutionData[]> {
  // Dynamic import so build doesn't fail if native modules missing
  const SFTPClient = (await import('ssh2-sftp-client')).default;
  const sftp = new SFTPClient();

  const connectOptions: Record<string, unknown> = {
    host: config.host,
    port: config.port,
    username: config.username,
    readyTimeout: 30000,
  };

  if (config.privateKey) {
    connectOptions.privateKey = config.privateKey;
  } else {
    connectOptions.password = config.password;
  }

  try {
    await sftp.connect(connectOptions);

    switch (operation) {
      case 'list': {
        const files = await sftp.list(remotePath);
        return files.map((f) => ({
          json: {
            name: f.name,
            type: f.type === 'd' ? 'directory' : 'file',
            size: f.size,
            modifiedAt: new Date(f.modifyTime).toISOString(),
            accessTime: new Date(f.accessTime).toISOString(),
            permissions: f.rights,
            owner: f.owner,
            group: f.group,
          },
        }));
      }

      case 'download': {
        // Check file size before downloading to avoid loading huge files into memory
        if (maxSizeBytes !== Infinity) {
          try {
            const stat = await sftp.stat(remotePath);
            if (stat.size > maxSizeBytes) {
              const sizeMB = (stat.size / 1024 / 1024).toFixed(1);
              const limitMB = (maxSizeBytes / 1024 / 1024).toFixed(0);
              throw new Error(
                `Dosya çok büyük: ${sizeMB}MB (limit: ${limitMB}MB). ` +
                `"Maksimum İndirme Boyutu" değerini artırın veya 0 yaparak sınırsız indirmeyi etkinleştirin.`
              );
            }
          } catch (e) {
            if ((e as Error).message?.includes('Dosya çok büyük')) throw e;
          }
        }
        const buf = await sftp.get(remotePath) as Buffer;
        const result = encoding === 'base64' ? buf.toString('base64') : buf.toString('utf8');
        return [{ json: { path: remotePath, content: result, encoding, size: buf.length } }];
      }

      case 'upload': {
        const buf = encoding === 'base64' ? Buffer.from(content, 'base64') : Buffer.from(content, 'utf8');
        await sftp.put(buf, remotePath);
        return [{ json: { path: remotePath, uploaded: true, size: buf.length } }];
      }

      case 'delete': {
        const stat = await sftp.stat(remotePath).catch(() => null);
        if (stat?.isDirectory) {
          await sftp.rmdir(remotePath, true);
        } else {
          await sftp.delete(remotePath);
        }
        return [{ json: { path: remotePath, deleted: true } }];
      }

      case 'rename': {
        if (!newPath) throw new Error('Yeniden adlandırmak için yeni yol belirtilmeli');
        await sftp.rename(remotePath, newPath);
        return [{ json: { oldPath: remotePath, newPath, renamed: true } }];
      }

      case 'mkdir': {
        await sftp.mkdir(remotePath, true);
        return [{ json: { path: remotePath, created: true } }];
      }

      default:
        throw new Error(`Bilinmeyen işlem: ${operation}`);
    }
  } finally {
    await sftp.end();
  }
}
