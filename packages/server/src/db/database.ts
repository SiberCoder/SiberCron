import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  IWorkflow,
  IExecution,
  ICredential,
  ICredentialWithData,
  CreateWorkflowRequest,
  UpdateWorkflowRequest,
  WorkflowListQuery,
  ExecutionListQuery,
  PaginatedResponse,
} from '@sibercron/shared';
import { DEFAULT_WORKFLOW_SETTINGS } from '@sibercron/shared';
import { config } from '../config/env.js';

// ── Credential Encryption ─────────────────────────────────────────────

const DEV_KEY = 'dev-only-key-do-not-use-in-prod!!';
const isDevKey = config.encryptionKey === DEV_KEY;

if (isDevKey) {
  console.warn('[DB] WARNING: Using development encryption key. Credentials will NOT be encrypted. Set ENCRYPTION_KEY env var for production.');
}

// Pad or derive a 32-byte hex key from the config value
function deriveHexKey(raw: string): string {
  // If already a valid 64-char hex string (32 bytes), use as-is
  if (/^[0-9a-f]{64}$/i.test(raw)) return raw.toLowerCase();
  // Otherwise derive one via SHA-256
  return crypto.createHash('sha256').update(raw).digest('hex');
}

const ENCRYPTION_KEY_HEX = isDevKey ? '' : deriveHexKey(config.encryptionKey);

function encrypt(text: string, key: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return iv.toString('hex') + ':' + authTag + ':' + encrypted;
}

function decrypt(ciphertext: string, key: string): string {
  const [ivHex, authTagHex, encrypted] = ciphertext.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function encryptCredentialData(data: Record<string, unknown>): Record<string, unknown> | string {
  if (isDevKey) return data; // no encryption in dev mode
  return encrypt(JSON.stringify(data), ENCRYPTION_KEY_HEX) as unknown as string;
}

function decryptCredentialData(data: Record<string, unknown> | string): Record<string, unknown> {
  if (typeof data === 'object') return data; // not encrypted (dev mode or legacy)
  try {
    return JSON.parse(decrypt(data as string, ENCRYPTION_KEY_HEX)) as Record<string, unknown>;
  } catch {
    console.warn('[DB] Failed to decrypt credential data, returning as-is');
    return typeof data === 'string' ? { _raw: data } : data;
  }
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'sibercron.json');

/**
 * In-memory database for MVP.
 * Stores workflows, executions, and credentials as Maps.
 */
export interface ISocialAccount {
  id: string;
  platform: string;
  name: string;
  identifier: string;
  config: Record<string, unknown>;
  status: 'connected' | 'disconnected' | 'error';
  stats: {
    messagesSent: number;
    messagesReceived: number;
    workflowsTriggered: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ICommandRegistration {
  id: string;
  command: string;
  description: string;
  workflowId: string;
  platforms: string[];
  responseType: 'text' | 'workflow_output';
  createdAt: string;
  updatedAt: string;
}

// ── API Key Model ──────────────────────────────────────────────────────

export interface IApiKey {
  id: string;
  userId: string;
  name: string;
  keyHash: string;      // SHA-256 hex of the actual key
  prefix: string;       // first 8 chars shown in UI (scx_xxxx)
  lastUsedAt: string | null;
  createdAt: string;
  expiresAt: string | null;
}

// ── User Model ─────────────────────────────────────────────────────────

export interface IUser {
  id: string;
  username: string;
  passwordHash: string;
  role: 'admin' | 'viewer';
  createdAt: string;
  updatedAt: string;
}

const MAX_VERSIONS_PER_WORKFLOW = 20;

export interface IWorkflowVersion {
  version: number;          // 1-based, increments on each save
  workflowId: string;
  snapshot: IWorkflow;      // full snapshot at time of save
  savedAt: string;
  label?: string;           // optional user label
}

export class Database {
  private workflows: Map<string, IWorkflow> = new Map();
  private executions: Map<string, IExecution> = new Map();
  private credentials: Map<string, ICredentialWithData> = new Map();
  private socialAccounts: Map<string, ISocialAccount> = new Map();
  private setupConfig: Record<string, unknown> = {};
  private commandRegistrations: Map<string, ICommandRegistration> = new Map();
  /** workflow version history: workflowId → sorted array of versions (newest last) */
  private workflowVersions: Map<string, IWorkflowVersion[]> = new Map();
  private users: Map<string, IUser> = new Map();
  private apiKeys: Map<string, IApiKey> = new Map();

  // ── API Key CRUD ─────────────────────────────────────────────────────

  createApiKey(data: { userId: string; name: string; expiresAt?: string | null }): { key: IApiKey; plaintext: string } {
    const raw = `scx_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(raw).digest('hex');
    const prefix = raw.slice(0, 8);
    const now = new Date().toISOString();
    const apiKey: IApiKey = {
      id: crypto.randomUUID(),
      userId: data.userId,
      name: data.name,
      keyHash,
      prefix,
      lastUsedAt: null,
      createdAt: now,
      expiresAt: data.expiresAt ?? null,
    };
    this.apiKeys.set(apiKey.id, apiKey);
    this.save();
    return { key: apiKey, plaintext: raw };
  }

  findApiKeyByHash(hash: string): IApiKey | null {
    for (const k of this.apiKeys.values()) {
      if (k.keyHash === hash) return k;
    }
    return null;
  }

  listApiKeys(userId: string): IApiKey[] {
    return Array.from(this.apiKeys.values()).filter((k) => k.userId === userId);
  }

  deleteApiKey(id: string): boolean {
    const result = this.apiKeys.delete(id);
    if (result) this.save();
    return result;
  }

  touchApiKey(id: string): void {
    const k = this.apiKeys.get(id);
    if (k) {
      this.apiKeys.set(id, { ...k, lastUsedAt: new Date().toISOString() });
      this.save();
    }
  }

  // ── User CRUD ────────────────────────────────────────────────────────

  createUser(data: { username: string; passwordHash: string; role?: IUser['role'] }): IUser {
    const now = new Date().toISOString();
    const user: IUser = {
      id: crypto.randomUUID(),
      username: data.username,
      passwordHash: data.passwordHash,
      role: data.role ?? 'admin',
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    this.save();
    return user;
  }

  findUserByUsername(username: string): IUser | null {
    for (const user of this.users.values()) {
      if (user.username === username) return user;
    }
    return null;
  }

  findUserById(id: string): IUser | null {
    return this.users.get(id) ?? null;
  }

  listUsers(): IUser[] {
    return Array.from(this.users.values());
  }

  updateUserPassword(id: string, passwordHash: string): boolean {
    const user = this.users.get(id);
    if (!user) return false;
    this.users.set(id, { ...user, passwordHash, updatedAt: new Date().toISOString() });
    this.save();
    return true;
  }

  deleteUser(id: string): boolean {
    const result = this.users.delete(id);
    if (result) this.save();
    return result;
  }

  hasUsers(): boolean {
    return this.users.size > 0;
  }

  // ── Workflow CRUD ────────────────────────────────────────────────────

  createWorkflow(data: CreateWorkflowRequest): IWorkflow {
    const now = new Date().toISOString();
    const workflow: IWorkflow = {
      id: crypto.randomUUID(),
      name: data.name,
      description: data.description,
      nodes: data.nodes ?? [],
      edges: data.edges ?? [],
      settings: { ...DEFAULT_WORKFLOW_SETTINGS, ...data.settings },
      isActive: false,
      triggerType: data.triggerType ?? 'manual',
      cronExpression: data.cronExpression,
      webhookPath: data.webhookPath,
      createdAt: now,
      updatedAt: now,
    };
    this.workflows.set(workflow.id, workflow);
    this.save();
    return workflow;
  }

  getWorkflow(id: string): IWorkflow | null {
    return this.workflows.get(id) ?? null;
  }

  listWorkflows(query: WorkflowListQuery = {}): PaginatedResponse<IWorkflow> {
    const { page = 1, limit = 20, search, isActive, triggerType } = query;

    let items = Array.from(this.workflows.values());

    if (search) {
      const lower = search.toLowerCase();
      items = items.filter(
        (w) =>
          w.name.toLowerCase().includes(lower) ||
          w.description?.toLowerCase().includes(lower),
      );
    }

    if (isActive !== undefined) {
      items = items.filter((w) => w.isActive === isActive);
    }

    if (triggerType) {
      items = items.filter((w) => w.triggerType === triggerType);
    }

    // Sort by updatedAt descending
    items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const total = items.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const data = items.slice(offset, offset + limit);

    return { data, total, page, limit, totalPages };
  }

  updateWorkflow(id: string, data: UpdateWorkflowRequest): IWorkflow | null {
    const existing = this.workflows.get(id);
    if (!existing) return null;

    // Auto-snapshot the current state before overwriting
    this._snapshotWorkflow(existing);

    const updated: IWorkflow = {
      ...existing,
      ...data,
      settings: data.settings
        ? { ...existing.settings, ...data.settings }
        : existing.settings,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.workflows.set(id, updated);
    this.save();
    return updated;
  }

  private _snapshotWorkflow(workflow: IWorkflow): void {
    const existing = this.workflowVersions.get(workflow.id) ?? [];
    const nextVersion = (existing[existing.length - 1]?.version ?? 0) + 1;
    const snapshot: IWorkflowVersion = {
      version: nextVersion,
      workflowId: workflow.id,
      snapshot: JSON.parse(JSON.stringify(workflow)) as IWorkflow,
      savedAt: new Date().toISOString(),
    };
    const updated = [...existing, snapshot];
    // Keep only last MAX_VERSIONS_PER_WORKFLOW versions
    if (updated.length > MAX_VERSIONS_PER_WORKFLOW) {
      updated.splice(0, updated.length - MAX_VERSIONS_PER_WORKFLOW);
    }
    this.workflowVersions.set(workflow.id, updated);
  }

  /** Returns versions newest-first */
  getWorkflowVersions(workflowId: string): IWorkflowVersion[] {
    const versions = this.workflowVersions.get(workflowId) ?? [];
    return [...versions].reverse();
  }

  restoreWorkflowVersion(workflowId: string, version: number): IWorkflow | null {
    const versions = this.workflowVersions.get(workflowId) ?? [];
    const target = versions.find((v) => v.version === version);
    if (!target) return null;

    // Snapshot current before restoring
    const current = this.workflows.get(workflowId);
    if (current) this._snapshotWorkflow(current);

    // Restore, but update the updatedAt
    const restored: IWorkflow = {
      ...target.snapshot,
      updatedAt: new Date().toISOString(),
    };
    this.workflows.set(workflowId, restored);
    this.save();
    return restored;
  }

  deleteWorkflow(id: string): boolean {
    const result = this.workflows.delete(id);
    this.save();
    return result;
  }

  // ── Execution CRUD ───────────────────────────────────────────────────

  createExecution(data: IExecution): IExecution {
    this.executions.set(data.id, data);
    this.save();
    return data;
  }

  getExecution(id: string): IExecution | null {
    return this.executions.get(id) ?? null;
  }

  listExecutions(query: ExecutionListQuery = {}): PaginatedResponse<IExecution> {
    const { page = 1, limit = 20, workflowId, status } = query;

    let items = Array.from(this.executions.values());

    if (workflowId) {
      items = items.filter((e) => e.workflowId === workflowId);
    }

    if (status) {
      items = items.filter((e) => e.status === status);
    }

    // Sort by createdAt descending
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const total = items.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const data = items.slice(offset, offset + limit);

    return { data, total, page, limit, totalPages };
  }

  updateExecution(id: string, data: Partial<IExecution>): IExecution | null {
    const existing = this.executions.get(id);
    if (!existing) return null;

    const updated: IExecution = { ...existing, ...data, id: existing.id };
    this.executions.set(id, updated);
    this.save();
    return updated;
  }

  deleteExecution(id: string): boolean {
    const result = this.executions.delete(id);
    this.save();
    return result;
  }

  // ── Credential CRUD ──────────────────────────────────────────────────

  createCredential(data: { name: string; type: string; data: Record<string, unknown> }): ICredentialWithData {
    const now = new Date().toISOString();
    const encryptedData = encryptCredentialData(data.data);
    const credential: ICredentialWithData = {
      id: crypto.randomUUID(),
      name: data.name,
      type: data.type,
      data: encryptedData as Record<string, unknown>,
      createdAt: now,
      updatedAt: now,
    };
    this.credentials.set(credential.id, credential);
    this.save();
    // Return with decrypted data
    return { ...credential, data: data.data };
  }

  getCredential(id: string): ICredentialWithData | null {
    const credential = this.credentials.get(id);
    if (!credential) return null;
    return { ...credential, data: decryptCredentialData(credential.data) };
  }

  /** List credentials without exposing the data field. */
  listCredentials(): ICredential[] {
    return Array.from(this.credentials.values()).map(({ data: _data, ...rest }) => rest);
  }

  updateCredential(
    id: string,
    data: Partial<{ name: string; type: string; data: Record<string, unknown> }>,
  ): ICredentialWithData | null {
    const existing = this.credentials.get(id);
    if (!existing) return null;

    const updatedData = data.data ? encryptCredentialData(data.data) : existing.data;
    const updated: ICredentialWithData = {
      ...existing,
      ...data,
      data: updatedData as Record<string, unknown>,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.credentials.set(id, updated);
    this.save();
    // Return with decrypted data
    return { ...updated, data: data.data ? data.data : decryptCredentialData(existing.data) };
  }

  deleteCredential(id: string): boolean {
    const result = this.credentials.delete(id);
    this.save();
    return result;
  }

  // ── Social Account CRUD ──────────────────────────────────────────────

  createSocialAccount(data: {
    platform: string;
    name: string;
    identifier: string;
    config: Record<string, unknown>;
  }): ISocialAccount {
    const now = new Date().toISOString();
    const account: ISocialAccount = {
      id: crypto.randomUUID(),
      platform: data.platform,
      name: data.name,
      identifier: data.identifier,
      config: data.config,
      status: 'connected',
      stats: {
        messagesSent: 0,
        messagesReceived: 0,
        workflowsTriggered: 0,
      },
      createdAt: now,
      updatedAt: now,
    };
    this.socialAccounts.set(account.id, account);
    this.save();
    return account;
  }

  getSocialAccount(id: string): ISocialAccount | null {
    return this.socialAccounts.get(id) ?? null;
  }

  listSocialAccounts(): ISocialAccount[] {
    return Array.from(this.socialAccounts.values());
  }

  updateSocialAccount(
    id: string,
    data: Partial<{ name: string; identifier: string; config: Record<string, unknown>; status: ISocialAccount['status'] }>,
  ): ISocialAccount | null {
    const existing = this.socialAccounts.get(id);
    if (!existing) return null;

    const updated: ISocialAccount = {
      ...existing,
      ...data,
      id: existing.id,
      createdAt: existing.createdAt,
      stats: existing.stats,
      updatedAt: new Date().toISOString(),
    };
    this.socialAccounts.set(id, updated);
    this.save();
    return updated;
  }

  deleteSocialAccount(id: string): boolean {
    const result = this.socialAccounts.delete(id);
    this.save();
    return result;
  }

  incrementAccountStats(
    id: string,
    field: 'messagesSent' | 'messagesReceived' | 'workflowsTriggered',
  ): void {
    const account = this.socialAccounts.get(id);
    if (account) {
      account.stats[field]++;
      account.updatedAt = new Date().toISOString();
      this.save();
    }
  }

  // ── Setup Config ─────────────────────────────────────────────────────

  saveSetupConfig(config: Record<string, unknown>): void {
    this.setupConfig = { ...config };
    this.save();
  }

  getSetupConfig(): Record<string, unknown> | null {
    return Object.keys(this.setupConfig).length > 0 ? this.setupConfig : null;
  }

  // ── Command Registrations ────────────────────────────────────────────

  registerCommand(data: {
    command: string;
    description: string;
    workflowId: string;
    platforms: string[];
    responseType?: 'text' | 'workflow_output';
  }): ICommandRegistration {
    const now = new Date().toISOString();
    const registration: ICommandRegistration = {
      id: crypto.randomUUID(),
      command: data.command,
      description: data.description,
      workflowId: data.workflowId,
      platforms: data.platforms,
      responseType: data.responseType ?? 'text',
      createdAt: now,
      updatedAt: now,
    };
    this.commandRegistrations.set(registration.id, registration);
    this.save();
    return registration;
  }

  getCommands(): ICommandRegistration[] {
    return Array.from(this.commandRegistrations.values());
  }

  getCommandByName(name: string): ICommandRegistration | null {
    for (const cmd of this.commandRegistrations.values()) {
      if (cmd.command === name) return cmd;
    }
    return null;
  }

  updateCommand(
    id: string,
    data: Partial<{ command: string; description: string; workflowId: string; platforms: string[]; responseType: 'text' | 'workflow_output' }>,
  ): ICommandRegistration | null {
    const existing = this.commandRegistrations.get(id);
    if (!existing) return null;

    const updated: ICommandRegistration = {
      ...existing,
      ...data,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.commandRegistrations.set(id, updated);
    this.save();
    return updated;
  }

  deleteCommand(id: string): boolean {
    const result = this.commandRegistrations.delete(id);
    this.save();
    return result;
  }

  // ── Persistence ──────────────────────────────────────────────────────

  private _savePending = false;

  /**
   * Schedule a debounced save.
   * Multiple rapid mutations (e.g. per-node execution updates) are batched
   * into a single disk write via setImmediate, avoiding repeated synchronous
   * blocking of the event loop.
   */
  save(): void {
    if (this._savePending) return;
    this._savePending = true;
    setImmediate(() => {
      this._savePending = false;
      this._flush();
    });
  }

  private _flush(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      const data = {
        workflows: Object.fromEntries(this.workflows),
        executions: Object.fromEntries(this.executions),
        credentials: Object.fromEntries(this.credentials),
        socialAccounts: Object.fromEntries(this.socialAccounts),
        commandRegistrations: Object.fromEntries(this.commandRegistrations),
        setupConfig: this.setupConfig,
        workflowVersions: Object.fromEntries(this.workflowVersions),
        users: Object.fromEntries(this.users),
        apiKeys: Object.fromEntries(this.apiKeys),
      };
      // Write to a temp file then rename for atomic replacement.
      // Prevents a corrupt data file if the process dies mid-write.
      const tmpFile = `${DATA_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DATA_FILE);
    } catch (err) {
      console.error('[DB] Save error:', (err as Error).message);
    }
  }

  load(): void {
    try {
      if (!fs.existsSync(DATA_FILE)) return;
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (data.workflows) this.workflows = new Map(Object.entries(data.workflows));
      if (data.executions) this.executions = new Map(Object.entries(data.executions));
      if (data.credentials) this.credentials = new Map(Object.entries(data.credentials));
      if (data.socialAccounts) this.socialAccounts = new Map(Object.entries(data.socialAccounts));
      if (data.commandRegistrations) this.commandRegistrations = new Map(Object.entries(data.commandRegistrations));
      if (data.setupConfig) this.setupConfig = data.setupConfig;
      if (data.workflowVersions) {
        this.workflowVersions = new Map(
          Object.entries(data.workflowVersions as Record<string, IWorkflowVersion[]>),
        );
      }
      if (data.users) this.users = new Map(Object.entries(data.users as Record<string, IUser>));
      if (data.apiKeys) this.apiKeys = new Map(Object.entries(data.apiKeys as Record<string, IApiKey>));
      console.log('[DB] Loaded from', DATA_FILE);
    } catch (err) {
      console.error('[DB] Load error:', (err as Error).message);
    }
  }
}

export const db = new Database();
db.load(); // Load persisted data on startup
