# SiberCron Architecture

## Overview

SiberCron is a monorepo consisting of 5 packages that work together to provide an AI-powered workflow automation platform.

```
┌─────────────────────────────────────────────────────┐
│                    @sibercron/editor                  │
│              React + React Flow + Zustand             │
│                   (Port 5173)                         │
└───────────────────────┬─────────────────────────────┘
                        │ REST API + WebSocket
┌───────────────────────▼─────────────────────────────┐
│                   @sibercron/server                   │
│                Fastify + Socket.io                    │
│                   (Port 3001)                         │
└──────┬────────────────┬──────────────────┬──────────┘
       │                │                  │
┌──────▼──────┐  ┌──────▼──────┐  ┌───────▼─────────┐
│ @sibercron/ │  │ @sibercron/ │  │   @sibercron/   │
│    core     │  │    nodes    │  │     shared      │
│  Engine +   │  │  Built-in   │  │   Types +       │
│  Scheduler  │  │  Nodes (13) │  │   Constants     │
└─────────────┘  └─────────────┘  └─────────────────┘
```

## Execution Flow

1. **User creates workflow** in the editor (drag & drop nodes, connect edges, configure parameters)
2. **Workflow saved** via REST API to the server's in-memory database
3. **Trigger fires** (manual click, cron schedule, or incoming webhook)
4. **WorkflowEngine** receives the workflow definition:
   - Builds a directed graph from nodes and edges
   - Topologically sorts nodes using Kahn's algorithm
   - Executes nodes in order, passing data along edges
5. **Each node execution**:
   - NodeExecutor creates an ExecutionContext with input data
   - Node's `execute()` method is called with the context
   - Output data is stored and passed to downstream nodes
   - Socket.io emits real-time progress events
6. **Results displayed** in the editor with live node status updates

## Node Plugin System

Every node implements the `INodeType` interface:

```typescript
interface INodeType {
  definition: INodeTypeDefinition;  // Metadata, properties, I/O
  execute(context: IExecutionContext): Promise<INodeExecutionData[]>;
}
```

Community nodes are npm packages named `sibercron-node-*` that export an array of `INodeType` objects.

## Data Flow

Data passes between nodes as `INodeExecutionData[]`:

```typescript
interface INodeExecutionData {
  json: Record<string, unknown>;  // Main data
  binary?: Record<string, Buffer>;  // Optional binary data
}
```

Each node receives the output of its predecessor(s) and produces its own output array.
