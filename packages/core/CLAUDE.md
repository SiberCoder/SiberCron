# @sibercron/core — Workflow Execution Engine

Saf logic paketi, I/O yok. Sadece `@sibercron/shared`'e bağlı.

## Modüller

### WorkflowEngine (engine/WorkflowEngine.ts)
- `execute(workflow, nodeTypes, triggerData?, credentialResolver?)` → `IExecution`
- DAG oluşturma → Kahn's topological sort → sıralı node çalıştırma
- Conditional branching: `shouldSkipNode()` — her gelen edge'in source'u conditional output mu kontrol eder
- Input toplama: upstream node output'larından `sourceHandle` eşleşmesiyle
- Event emitter: `execution:started`, `execution:node:start`, `execution:node:done`, `execution:completed`

### NodeExecutor (engine/NodeExecutor.ts)
- `execute(nodeInstance, nodeType, inputData, credentialResolver)` → `INodeExecutionResult`
- Registry'den node type bulma → credential resolver oluşturma → ExecutionContext oluşturma
- `Promise.race()` ile timeout (varsayılan 30s, `definition.timeout` ile override)

### ExecutionContext (engine/ExecutionContext.ts)
- `getInputData()` — upstream output items
- `getParameter<T>(name)` — typed node parameter
- `getCredential(name)` — credential resolver'a delege
- `helpers.httpRequest(options)` — native fetch + AbortController timeout
- `helpers.log(message)` — console.log

### NodeRegistry (nodes/NodeRegistry.ts)
- `Map<string, INodeType>` — name ile kayıt
- `register`, `get`, `getAll`, `getDefinitions`, `getByGroup`, `has`

## Dışa Aktarımlar (src/index.ts)
`WorkflowEngine`, `NodeExecutor`, `ExecutionContext`, `NodeRegistry`
