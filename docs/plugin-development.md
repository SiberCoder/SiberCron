# Plugin Development Guide

## Creating a Custom Node

SiberCron uses a plugin system based on the `INodeType` interface. You can create custom nodes as npm packages.

### 1. Create Package

```bash
mkdir sibercron-node-myservice
cd sibercron-node-myservice
npm init -y
```

Name your package with the `sibercron-node-` prefix.

### 2. Implement INodeType

```typescript
import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

export const MyServiceNode: INodeType = {
  definition: {
    displayName: 'My Service',
    name: 'sibercron.myService',
    icon: 'Star',
    color: '#F59E0B',
    group: 'core',
    version: 1,
    description: 'Integrates with My Service',
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      { name: 'myServiceApi', required: true, displayName: 'My Service API Key' }
    ],
    properties: [
      {
        name: 'action',
        displayName: 'Action',
        type: 'select',
        required: true,
        options: [
          { name: 'Get Data', value: 'get' },
          { name: 'Send Data', value: 'send' },
        ],
      },
      {
        name: 'endpoint',
        displayName: 'Endpoint',
        type: 'string',
        required: true,
        placeholder: '/api/data',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const items = context.getInputData();
    const action = context.getParameter<string>('action');
    const endpoint = context.getParameter<string>('endpoint');
    const creds = await context.getCredential('myServiceApi');

    const response = await context.helpers.httpRequest({
      url: `https://myservice.com${endpoint}`,
      method: action === 'get' ? 'GET' : 'POST',
      headers: { 'Authorization': `Bearer ${creds.apiKey}` },
      body: action === 'send' ? items[0]?.json : undefined,
    });

    return [{ json: response as Record<string, unknown> }];
  },
};

// Export as array for auto-discovery
export const nodes = [MyServiceNode];
```

### 3. Property Types

| Type | Renders As | Use For |
|------|-----------|---------|
| `string` | Text input | Simple text values |
| `number` | Number input | Numeric values |
| `boolean` | Toggle switch | On/off settings |
| `select` | Dropdown | Choosing from options |
| `multiSelect` | Multi-dropdown | Multiple selections |
| `code` | Code editor | JavaScript/TypeScript code |
| `json` | JSON editor | Complex data structures |
| `cron` | Cron builder | Cron expressions |

### 4. Conditional Properties

Show/hide properties based on other property values:

```typescript
{
  name: 'webhookUrl',
  displayName: 'Webhook URL',
  type: 'string',
  displayOptions: {
    show: { action: ['send'] },  // Only show when action = 'send'
  },
}
```
