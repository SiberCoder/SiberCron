import type { INodeType } from '@sibercron/shared';

import { ManualTriggerNode } from './triggers/ManualTrigger.node.js';
import { CronTriggerNode } from './triggers/CronTrigger.node.js';
import { WebhookTriggerNode } from './triggers/WebhookTrigger.node.js';
import { HttpRequestNode } from './core/HttpRequest.node.js';
import { CodeNode } from './core/Code.node.js';
import { LogNode } from './core/Log.node.js';
import { ConditionalNode } from './core/Conditional.node.js';
import { TransformNode } from './core/Transform.node.js';
import { MergeNode } from './core/Merge.node.js';
import { DelayNode } from './core/Delay.node.js';
import { AIAgentNode } from './ai/AIAgent.node.js';
import { AutonomousDevNode } from './ai/AutonomousDev.node.js';
import { TelegramSendNode } from './messaging/TelegramSend.node.js';
import { DiscordSendNode } from './messaging/DiscordSend.node.js';
import { SlackSendNode } from './messaging/SlackSend.node.js';
import { WhatsAppReceiveNode } from './messaging/WhatsAppReceive.node.js';
import { WhatsAppSendNode } from './messaging/WhatsAppSend.node.js';

export const builtinNodes: INodeType[] = [
  ManualTriggerNode,
  CronTriggerNode,
  WebhookTriggerNode,
  HttpRequestNode,
  CodeNode,
  LogNode,
  ConditionalNode,
  TransformNode,
  MergeNode,
  DelayNode,
  AIAgentNode,
  AutonomousDevNode,
  TelegramSendNode,
  DiscordSendNode,
  SlackSendNode,
  WhatsAppReceiveNode,
  WhatsAppSendNode,
];

export {
  ManualTriggerNode,
  CronTriggerNode,
  WebhookTriggerNode,
  HttpRequestNode,
  CodeNode,
  LogNode,
  ConditionalNode,
  TransformNode,
  MergeNode,
  DelayNode,
  AIAgentNode,
  AutonomousDevNode,
  TelegramSendNode,
  DiscordSendNode,
  SlackSendNode,
  WhatsAppReceiveNode,
  WhatsAppSendNode,
};
