/**
 * Curated icon registry for node icons and UI icons.
 * This avoids wildcard `import * as LucideIcons` which prevents tree-shaking
 * and bloats the bundle with all 1000+ lucide icons.
 *
 * When adding a new node with a new icon name, add it here too.
 */
import {
  // Node icons (from packages/nodes definitions)
  Brain,
  RefreshCcw,
  Code,
  GitBranch,
  Timer,
  Globe,
  FileText,
  Merge,
  Shuffle,
  MessageCircle,
  Hash,
  Send,
  MessageSquare,
  Clock,
  Play,
  // Common UI icons
  Box,
  Zap,
  Database,
  Mail,
  Key,
  Settings,
  Terminal,
  Webhook,
  Cpu,
  Bot,
  Workflow,
  Network,
  LayoutDashboard,
  ListChecks,
  History,
  Shield,
  Users,
  Layers,
  type LucideIcon,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  Brain,
  RefreshCcw,
  Code,
  GitBranch,
  Timer,
  Globe,
  FileText,
  Merge,
  Shuffle,
  MessageCircle,
  Hash,
  Send,
  MessageSquare,
  Clock,
  Play,
  Box,
  Zap,
  Database,
  Mail,
  Key,
  Settings,
  Terminal,
  Webhook,
  Cpu,
  Bot,
  Workflow,
  Network,
  LayoutDashboard,
  ListChecks,
  History,
  Shield,
  Users,
  Layers,
};

/**
 * Look up an icon by name. Falls back to Box if not found.
 */
export function getNodeIcon(iconName: string): LucideIcon {
  return ICON_MAP[iconName] ?? Box;
}
