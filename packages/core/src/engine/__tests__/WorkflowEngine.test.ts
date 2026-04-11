import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowEngine } from '../WorkflowEngine.js';
import { NodeRegistry } from '../../nodes/NodeRegistry.js';
import type { IWorkflow, INodeType, INodeExecutionData } from '@sibercron/shared';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeWorkflow(overrides: Partial<IWorkflow> = {}): IWorkflow {
  return {
    id: 'wf-1',
    name: 'Test Workflow',
    nodes: [],
    edges: [],
    settings: {},
    isActive: false,
    triggerType: 'manual',
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeNodeType(name: string, executeFn: (ctx: any) => Promise<INodeExecutionData[]>): INodeType {
  return {
    definition: {
      displayName: name,
      name,
      icon: 'Circle',
      color: '#000',
      group: 'core',
      version: 1,
      description: name,
      inputs: ['main'],
      outputs: ['main'],
      properties: [],
    },
    execute: executeFn,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WorkflowEngine', () => {
  let registry: NodeRegistry;
  let engine: WorkflowEngine;

  beforeEach(() => {
    registry = new NodeRegistry();
    engine = new WorkflowEngine(registry);
  });

  it('executes a single-node workflow', async () => {
    registry.register(makeNodeType('trigger', async (ctx) => [{ json: { hello: 'world' } }]));

    const wf = makeWorkflow({
      nodes: [{ id: 'n1', type: 'trigger', name: 'trigger', position: { x: 0, y: 0 }, parameters: {} }],
      edges: [],
    });

    const result = await engine.execute(wf);
    expect(result.status).toBe('success');
    expect(result.nodeResults['n1'].status).toBe('success');
  });

  it('passes output of first node as input to second node', async () => {
    const receivedInputs: unknown[] = [];
    registry.register(makeNodeType('source', async () => [{ json: { value: 42 } }]));
    registry.register(makeNodeType('sink', async (ctx) => {
      receivedInputs.push(...ctx.getInputData());
      return ctx.getInputData();
    }));

    const wf = makeWorkflow({
      nodes: [
        { id: 'n1', type: 'source', name: 'source', position: { x: 0, y: 0 }, parameters: {} },
        { id: 'n2', type: 'sink', name: 'sink', position: { x: 100, y: 0 }, parameters: {} },
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
    });

    await engine.execute(wf);
    expect(receivedInputs).toHaveLength(1);
    expect((receivedInputs[0] as any).json.value).toBe(42);
  });

  describe('branch routing', () => {
    it('routes items to correct branch when sourceHandle is set', async () => {
      // Node that returns mixed-branch items
      registry.register({
        ...makeNodeType('splitter', async () => [
          { json: { id: 1, branch: 'a' } },
          { json: { id: 2, branch: 'b' } },
          { json: { id: 3, branch: 'a' } },
        ]),
        definition: {
          ...makeNodeType('splitter', async () => []).definition,
          outputs: ['a', 'b'],
        },
      });

      const aItems: unknown[] = [];
      const bItems: unknown[] = [];

      registry.register(makeNodeType('sink-a', async (ctx) => {
        aItems.push(...ctx.getInputData());
        return ctx.getInputData();
      }));
      registry.register(makeNodeType('sink-b', async (ctx) => {
        bItems.push(...ctx.getInputData());
        return ctx.getInputData();
      }));

      const wf = makeWorkflow({
        nodes: [
          { id: 'n1', type: 'splitter', name: 'splitter', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n2', type: 'sink-a', name: 'sink-a', position: { x: 100, y: 0 }, parameters: {} },
          { id: 'n3', type: 'sink-b', name: 'sink-b', position: { x: 100, y: 100 }, parameters: {} },
        ],
        edges: [
          { id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'a' },
          { id: 'e2', source: 'n1', target: 'n3', sourceHandle: 'b' },
        ],
      });

      await engine.execute(wf);

      expect(aItems).toHaveLength(2);
      expect(bItems).toHaveLength(1);
      expect((aItems as any[]).every((i) => i.json.branch === 'a')).toBe(true);
      expect((bItems[0] as any).json.branch).toBe('b');
    });

    it('routes all items to a connected node with no sourceHandle', async () => {
      // Items with branches still pass through an edge with no handle
      registry.register(makeNodeType('source', async () => [
        { json: { id: 1, branch: 'a' } },
        { json: { id: 2, branch: 'b' } },
      ]));

      const received: unknown[] = [];
      registry.register(makeNodeType('sink', async (ctx) => {
        received.push(...ctx.getInputData());
        return ctx.getInputData();
      }));

      const wf = makeWorkflow({
        nodes: [
          { id: 'n1', type: 'source', name: 'source', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n2', type: 'sink', name: 'sink', position: { x: 100, y: 0 }, parameters: {} },
        ],
        // No sourceHandle → all items flow through
        edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
      });

      await engine.execute(wf);
      expect(received).toHaveLength(2);
    });

    it('conditional node routes all items to the same branch', async () => {
      // Simulate how Conditional node works: all items get same branch
      registry.register(makeNodeType('cond', async (ctx) => {
        const items = ctx.getInputData();
        return items.map((i: INodeExecutionData) => ({ json: { ...i.json, branch: 'true' } }));
      }));

      const trueItems: unknown[] = [];
      const falseItems: unknown[] = [];

      registry.register(makeNodeType('on-true', async (ctx) => {
        trueItems.push(...ctx.getInputData());
        return ctx.getInputData();
      }));
      registry.register(makeNodeType('on-false', async (ctx) => {
        falseItems.push(...ctx.getInputData());
        return ctx.getInputData();
      }));

      const wf = makeWorkflow({
        nodes: [
          { id: 'n1', type: 'cond', name: 'cond', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n2', type: 'on-true', name: 'on-true', position: { x: 100, y: 0 }, parameters: {} },
          { id: 'n3', type: 'on-false', name: 'on-false', position: { x: 100, y: 100 }, parameters: {} },
        ],
        edges: [
          { id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'true' },
          { id: 'e2', source: 'n1', target: 'n3', sourceHandle: 'false' },
        ],
      });

      const wfResult = await engine.execute(wf, { val: 1 });
      expect(trueItems.length).toBeGreaterThan(0);
      expect(falseItems).toHaveLength(0);
    });
  });

  it('marks execution as error when node throws', async () => {
    registry.register(makeNodeType('failing', async () => {
      throw new Error('deliberate failure');
    }));

    const wf = makeWorkflow({
      nodes: [{ id: 'n1', type: 'failing', name: 'failing', position: { x: 0, y: 0 }, parameters: {} }],
      edges: [],
    });

    const result = await engine.execute(wf);
    expect(result.status).toBe('error');
    expect(result.nodeResults['n1'].status).toBe('error');
    expect(result.nodeResults['n1'].error).toContain('deliberate failure');
  });

  it('emits execution events in order', async () => {
    registry.register(makeNodeType('node', async () => [{ json: {} }]));

    const events: string[] = [];
    const wf = makeWorkflow({
      nodes: [{ id: 'n1', type: 'node', name: 'node', position: { x: 0, y: 0 }, parameters: {} }],
      edges: [],
    });

    await engine.execute(wf, undefined, (event) => events.push(event));

    expect(events[0]).toBe('execution:started');
    expect(events).toContain('execution:node:start');
    expect(events).toContain('execution:node:done');
    expect(events[events.length - 1]).toBe('execution:completed');
  });
});
