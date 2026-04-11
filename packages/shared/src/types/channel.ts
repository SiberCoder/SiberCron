/** Messaging channel and pairing types - inspired by OpenClaw */

export type ChannelName =
  | 'whatsapp' | 'telegram' | 'discord' | 'slack'
  | 'signal' | 'matrix' | 'msteams' | 'line'
  | 'googlechat' | 'imessage';

export type AccessPolicy = 'pairing' | 'allowlist' | 'open' | 'disabled';

export interface ChannelConfig {
  name: ChannelName;
  displayName: string;
  icon: string;
  color: string;
  description: string;
  authFields: Array<{
    name: string;
    displayName: string;
    type: 'string' | 'password' | 'select';
    required: boolean;
    placeholder?: string;
    helpText?: string;
    helpUrl?: string;
  }>;
  supportsPairing: boolean;
  supportsGroups: boolean;
}

export interface PairingRequest {
  id: string;
  channel: ChannelName;
  senderIdentifier: string;   // phone number, username, etc.
  code: string;                // 8-char pairing code
  status: 'pending' | 'approved' | 'expired' | 'rejected';
  createdAt: string;
  expiresAt: string;           // 1 hour TTL
}

export interface ChannelAccessConfig {
  channel: ChannelName;
  dmPolicy: AccessPolicy;
  groupPolicy: AccessPolicy;
  allowFrom: string[];         // Allowed sender IDs
  groupAllowFrom: string[];    // Allowed group IDs
  requireMention: boolean;     // Require @mention in groups
  commandPrefix: string;       // Default "/"
  autoReply: boolean;
  welcomeMessage?: string;
}

// Pre-defined channel configs
export const CHANNELS: Record<ChannelName, ChannelConfig> = {
  whatsapp: {
    name: 'whatsapp',
    displayName: 'WhatsApp',
    icon: 'MessageCircle',
    color: '#25D366',
    description: 'WhatsApp Web uzerinden baglanin. QR kod tarayarak oturum acin.',
    authFields: [
      { name: 'phoneNumber', displayName: 'Telefon Numarasi', type: 'string', required: false, placeholder: '+905xxxxxxxxx', helpText: 'QR kod ile baglanirken otomatik alinir' },
    ],
    supportsPairing: true,
    supportsGroups: true,
  },
  telegram: {
    name: 'telegram',
    displayName: 'Telegram',
    icon: 'Send',
    color: '#0088CC',
    description: '@BotFather ile bot olusturun ve token\'i girin.',
    authFields: [
      { name: 'botToken', displayName: 'Bot Token', type: 'password', required: true, placeholder: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11', helpText: '@BotFather\'dan /newbot ile alin', helpUrl: 'https://t.me/BotFather' },
    ],
    supportsPairing: true,
    supportsGroups: true,
  },
  discord: {
    name: 'discord',
    displayName: 'Discord',
    icon: 'MessageSquare',
    color: '#5865F2',
    description: 'Discord Developer Portal\'dan bot olusturun.',
    authFields: [
      { name: 'botToken', displayName: 'Bot Token', type: 'password', required: true, placeholder: 'Bot token', helpText: 'Discord Developer Portal > Bot > Token', helpUrl: 'https://discord.com/developers/applications' },
      { name: 'serverId', displayName: 'Sunucu ID', type: 'string', required: true, placeholder: 'Sunucu ID', helpText: 'Gelistirici Modu acin > Sunucuya sag tiklayin > ID Kopyala' },
    ],
    supportsPairing: true,
    supportsGroups: true,
  },
  slack: {
    name: 'slack',
    displayName: 'Slack',
    icon: 'Hash',
    color: '#4A154B',
    description: 'Slack API\'den uygulama olusturun. Socket veya HTTP modu secin.',
    authFields: [
      { name: 'botToken', displayName: 'Bot Token', type: 'password', required: true, placeholder: 'xoxb-...', helpText: 'OAuth & Permissions > Bot User OAuth Token' },
      { name: 'appToken', displayName: 'App Token (Socket Mode)', type: 'password', required: false, placeholder: 'xapp-...', helpText: 'Socket Mode icin gerekli. Basic Information > App-Level Tokens' },
      { name: 'signingSecret', displayName: 'Signing Secret (HTTP Mode)', type: 'password', required: false, placeholder: 'Signing secret', helpText: 'HTTP Mode icin gerekli. Basic Information > Signing Secret' },
    ],
    supportsPairing: true,
    supportsGroups: true,
  },
  signal: {
    name: 'signal',
    displayName: 'Signal',
    icon: 'Shield',
    color: '#3A76F0',
    description: 'Signal CLI ile baglanti. QR ile mevcut hesabi baglayin veya yeni numara kaydedin.',
    authFields: [
      { name: 'account', displayName: 'Telefon Numarasi', type: 'string', required: true, placeholder: '+905xxxxxxxxx', helpText: 'E.164 formatinda' },
    ],
    supportsPairing: true,
    supportsGroups: true,
  },
  matrix: {
    name: 'matrix',
    displayName: 'Matrix',
    icon: 'Grid3X3',
    color: '#0DBD8B',
    description: 'Matrix homeserver\'a access token veya sifre ile baglanin.',
    authFields: [
      { name: 'homeserver', displayName: 'Homeserver URL', type: 'string', required: true, placeholder: 'https://matrix.org' },
      { name: 'accessToken', displayName: 'Access Token', type: 'password', required: false, placeholder: 'Access token', helpText: 'Token veya kullanici adi + sifre girin' },
      { name: 'userId', displayName: 'Kullanici ID', type: 'string', required: false, placeholder: '@bot:matrix.org' },
      { name: 'password', displayName: 'Sifre', type: 'password', required: false, placeholder: 'Sifre' },
    ],
    supportsPairing: true,
    supportsGroups: true,
  },
  msteams: {
    name: 'msteams',
    displayName: 'Microsoft Teams',
    icon: 'Building2',
    color: '#6264A7',
    description: 'Azure Portal\'dan bot kaydedin ve Teams uygulamasi olusturun.',
    authFields: [
      { name: 'appId', displayName: 'App ID', type: 'string', required: true, placeholder: 'Azure App ID' },
      { name: 'appPassword', displayName: 'App Password', type: 'password', required: true, placeholder: 'Client secret' },
      { name: 'tenantId', displayName: 'Tenant ID', type: 'string', required: true, placeholder: 'Azure Tenant ID' },
    ],
    supportsPairing: false,
    supportsGroups: true,
  },
  line: {
    name: 'line',
    displayName: 'LINE',
    icon: 'MessageSquare',
    color: '#00B900',
    description: 'LINE Developers\'dan Messaging API kanali olusturun.',
    authFields: [
      { name: 'channelAccessToken', displayName: 'Channel Access Token', type: 'password', required: true, placeholder: 'Token' },
      { name: 'channelSecret', displayName: 'Channel Secret', type: 'password', required: true, placeholder: 'Secret' },
    ],
    supportsPairing: true,
    supportsGroups: true,
  },
  googlechat: {
    name: 'googlechat',
    displayName: 'Google Chat',
    icon: 'MessageCircle',
    color: '#00AC47',
    description: 'Google Cloud Console\'dan Chat API\'yi etkinlestirin ve service account olusturun.',
    authFields: [
      { name: 'serviceAccountKey', displayName: 'Service Account JSON', type: 'password', required: true, placeholder: 'JSON key icerigi', helpText: 'Service account JSON dosyasinin icerigi' },
    ],
    supportsPairing: false,
    supportsGroups: true,
  },
  imessage: {
    name: 'imessage',
    displayName: 'iMessage (BlueBubbles)',
    icon: 'Apple',
    color: '#34C759',
    description: 'BlueBubbles uygulamasi uzerinden iMessage erisimi. macOS gerektirir.',
    authFields: [
      { name: 'serverUrl', displayName: 'BlueBubbles Server URL', type: 'string', required: true, placeholder: 'http://your-mac:1234' },
      { name: 'password', displayName: 'API Sifresi', type: 'password', required: true, placeholder: 'BlueBubbles API sifresi' },
    ],
    supportsPairing: false,
    supportsGroups: true,
  },
};
