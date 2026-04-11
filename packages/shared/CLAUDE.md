# @sibercron/shared — TypeScript Types & Constants

Saf type tanımları + sabitler. Runtime bağımlılığı yok. Tüm paketler buna bağlı.

## Ana Interface'ler (src/types/)

### Workflow
- `IWorkflow` — { id, name, nodes: INodeInstance[], edges: IEdge[], settings: IWorkflowSettings, isActive, triggerType, cronExpression, webhookPath }
- `INodeInstance` — { id, type, name, position: {x,y}, parameters: Record, credentials?: Record }
- `IEdge` — { id, source, target, sourceHandle?, targetHandle? }
- `IWorkflowSettings` — { timeout: 300000, retry: false, retryCount: 3, continueOnFail: false }

### Node
- `INodeType` — { definition: INodeTypeDefinition, execute(context): Promise<INodeExecutionData[]> }
- `INodeTypeDefinition` — { displayName, name, icon, color, group, version, inputs[], outputs[], credentials?, properties[] }
- `INodeExecutionData` — { json: Record<string, any> }

### Execution
- `IExecution` — { id, workflowId, status, nodeResults: Record<nodeId, INodeExecutionResult>, startedAt, finishedAt, durationMs }
- `INodeExecutionResult` — { status, output: INodeExecutionData[], error?, durationMs }

### Credential
- `ICredential` / `ICredentialWithData` — { id, name, type, data }

### AI & Messaging
- `ChatMessage`, `ToolCallInfo`, `SystemState` — AI Brain chat types
- `ChannelConfig`, `PairingRequest` — 10 platform mesajlaşma config'i
- `AIProviderConfig`, `AIModelConfig`, `AIProviderName` — 13 AI provider

## Sabitler (src/constants/)
- `WS_EVENTS` — Socket.io event name sabitleri
- `DEFAULT_WORKFLOW_SETTINGS` — { timeout: 300000, retry: false, retryCount: 3, continueOnFail: false }
- `NODE_EXECUTION_TIMEOUT` — 30000 (30 saniye)

## Dışa Aktarım (src/index.ts)
Tüm type'lar ve sabitler re-export edilir.
