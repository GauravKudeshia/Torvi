import { AppShell } from '@/components/app-shell';
import { MemoryClient } from './memory-client';

export default function ProfessionalMemoryPage() {
  return <AppShell active="memory"><MemoryClient /></AppShell>;
}
