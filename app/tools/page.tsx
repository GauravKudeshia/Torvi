import { AppShell } from '@/components/app-shell';
import { CareerToolsClient } from './tools-client';

export default function ToolsPage() {
  return <AppShell active="tools"><CareerToolsClient /></AppShell>;
}
