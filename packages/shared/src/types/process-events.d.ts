/**
 * Augment NodeJS.Process with the custom inter-service events used throughout SiberCron.
 * This avoids `process.on('eventName' as any, ...)` type casts.
 *
 * Placed in shared/ so all packages (core, nodes, server) can benefit from it.
 */
declare namespace NodeJS {
  interface Process {
    on(event: 'autonomousDev:log', listener: (data: {
      executionId: string;
      level: string;
      message: string;
      data?: Record<string, unknown>;
    }) => void): this;

    on(event: 'autonomousDev:sessionUpdate', listener: (data: {
      executionId: string;
      sessionId: string;
      iteration: number;
    }) => void): this;

    on(event: 'scheduler:workflow:deactivated', listener: (data: {
      workflowId: string;
      workflow?: unknown;
    }) => void): this;

    on(event: 'ai:stream', listener: (data: {
      executionId: string;
      nodeId: string;
      nodeName: string;
      token: string;
    }) => void): this;

    emit(event: 'autonomousDev:log', data: {
      executionId: string;
      level: string;
      message: string;
      data?: Record<string, unknown>;
    }): boolean;

    emit(event: 'autonomousDev:sessionUpdate', data: {
      executionId: string;
      sessionId: string;
      iteration: number;
    }): boolean;

    emit(event: 'scheduler:workflow:deactivated', data: {
      workflowId: string;
      workflow?: unknown;
    }): boolean;

    emit(event: 'ai:stream', data: {
      executionId: string;
      nodeId: string;
      nodeName: string;
      token: string;
    }): boolean;
  }
}
