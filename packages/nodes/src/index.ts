import type { INodeType } from '@sibercron/shared';

import { ManualTriggerNode } from './triggers/ManualTrigger.node.js';
import { CronTriggerNode } from './triggers/CronTrigger.node.js';
import { WebhookTriggerNode } from './triggers/WebhookTrigger.node.js';
import { TelegramTriggerNode } from './triggers/TelegramTrigger.node.js';
import { GitHubTriggerNode } from './triggers/GitHubTrigger.node.js';
import { HttpRequestNode } from './core/HttpRequest.node.js';
import { CodeNode } from './core/Code.node.js';
import { LogNode } from './core/Log.node.js';
import { ConditionalNode } from './core/Conditional.node.js';
import { TransformNode } from './core/Transform.node.js';
import { MergeNode } from './core/Merge.node.js';
import { DelayNode } from './core/Delay.node.js';
import { AIAgentNode } from './ai/AIAgent.node.js';
import { AutonomousDevNode } from './ai/AutonomousDev.node.js';
import { AISummarizerNode } from './ai/AISummarizer.node.js';
import { AIClassifierNode } from './ai/AIClassifier.node.js';
import { TelegramSendNode } from './messaging/TelegramSend.node.js';
import { DiscordSendNode } from './messaging/DiscordSend.node.js';
import { SlackSendNode } from './messaging/SlackSend.node.js';
import { WhatsAppReceiveNode } from './messaging/WhatsAppReceive.node.js';
import { WhatsAppSendNode } from './messaging/WhatsAppSend.node.js';
import { LoopNode } from './core/Loop.node.js';
import { SplitNode } from './core/Split.node.js';
import { EmailSMTPNode } from './messaging/EmailSMTP.node.js';
import { DatabaseQueryNode } from './core/DatabaseQuery.node.js';
import { RedisNode } from './core/Redis.node.js';
import { RSSFeedNode } from './core/RSSFeed.node.js';
import { AIWebBrowserNode } from './ai/AIWebBrowser.node.js';
import { GoogleSheetsNode } from './core/GoogleSheets.node.js';
import { FtpSftpNode } from './core/FtpSftp.node.js';
import { GoogleDriveNode } from './core/GoogleDrive.node.js';
import { NotionDatabaseNode } from './core/NotionDatabase.node.js';
import { SwitchNode } from './core/Switch.node.js';
import { DateTimeNode } from './core/DateTime.node.js';
import { GitHubNode } from './core/GitHub.node.js';
import { AirtableNode } from './core/Airtable.node.js';
import { JiraNode } from './core/Jira.node.js';
import { FilterNode } from './core/Filter.node.js';
import { AggregateNode } from './core/Aggregate.node.js';
import { SortNode } from './core/Sort.node.js';

export const builtinNodes: INodeType[] = [
  ManualTriggerNode,
  CronTriggerNode,
  WebhookTriggerNode,
  TelegramTriggerNode,
  GitHubTriggerNode,
  HttpRequestNode,
  CodeNode,
  LogNode,
  ConditionalNode,
  TransformNode,
  MergeNode,
  DelayNode,
  LoopNode,
  SplitNode,
  AIAgentNode,
  AutonomousDevNode,
  AISummarizerNode,
  AIClassifierNode,
  TelegramSendNode,
  DiscordSendNode,
  SlackSendNode,
  WhatsAppReceiveNode,
  WhatsAppSendNode,
  EmailSMTPNode,
  DatabaseQueryNode,
  RedisNode,
  RSSFeedNode,
  AIWebBrowserNode,
  GoogleSheetsNode,
  FtpSftpNode,
  GoogleDriveNode,
  NotionDatabaseNode,
  SwitchNode,
  DateTimeNode,
  GitHubNode,
  AirtableNode,
  JiraNode,
  FilterNode,
  AggregateNode,
  SortNode,
];

export {
  ManualTriggerNode,
  CronTriggerNode,
  WebhookTriggerNode,
  TelegramTriggerNode,
  GitHubTriggerNode,
  HttpRequestNode,
  CodeNode,
  LogNode,
  ConditionalNode,
  TransformNode,
  MergeNode,
  DelayNode,
  LoopNode,
  SplitNode,
  AIAgentNode,
  AutonomousDevNode,
  AISummarizerNode,
  AIClassifierNode,
  TelegramSendNode,
  DiscordSendNode,
  SlackSendNode,
  WhatsAppReceiveNode,
  WhatsAppSendNode,
  EmailSMTPNode,
  DatabaseQueryNode,
  RedisNode,
  RSSFeedNode,
  AIWebBrowserNode,
  GoogleSheetsNode,
  FtpSftpNode,
  GoogleDriveNode,
  NotionDatabaseNode,
  SwitchNode,
  DateTimeNode,
  GitHubNode,
  AirtableNode,
  JiraNode,
  FilterNode,
  AggregateNode,
  SortNode,
};
