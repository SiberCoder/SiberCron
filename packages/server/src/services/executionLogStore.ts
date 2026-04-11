/**
 * In-memory store for live execution logs.
 * Nodes write here during execution, frontend polls to show real-time progress.
 */

export interface ExecutionLogEntry {
  timestamp: string;
  level: 'info' | 'ai_request' | 'ai_response' | 'ai_streaming' | 'auto_answer' | 'system' | 'error' | 'iteration';
  message: string;
  data?: Record<string, unknown>;
}

class ExecutionLogStore {
  private logs = new Map<string, ExecutionLogEntry[]>();
  private maxEntriesPerExecution = 500;
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    // Auto-cleanup stale execution logs every 30 minutes
    this.cleanupTimer = setInterval(() => this.cleanup(), 30 * 60 * 1000);
    // Allow Node.js to exit even if this timer is running
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  add(executionId: string, entry: Omit<ExecutionLogEntry, 'timestamp'>): void {
    if (!this.logs.has(executionId)) {
      this.logs.set(executionId, []);
    }
    const entries = this.logs.get(executionId)!;
    entries.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });
    // Keep last N entries
    if (entries.length > this.maxEntriesPerExecution) {
      entries.splice(0, entries.length - this.maxEntriesPerExecution);
    }
  }

  get(executionId: string, since?: number): ExecutionLogEntry[] {
    const entries = this.logs.get(executionId) || [];
    if (since != null && since > 0) {
      return entries.slice(since);
    }
    return entries;
  }

  clear(executionId: string): void {
    this.logs.delete(executionId);
  }

  // Clean up old entries (called automatically every 30 min, or manually)
  cleanup(maxAgeMs = 3600000): void {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    for (const [id, entries] of this.logs) {
      if (entries.length === 0 || entries[entries.length - 1].timestamp < cutoff) {
        this.logs.delete(id);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
  }
}

export const executionLogStore = new ExecutionLogStore();
