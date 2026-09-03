import { AppShell } from '@/components/app-shell';
import { OnboardingClient } from './onboarding-client';

export default function OnboardingPage() {
  return <AppShell active="documents"><OnboardingClient /></AppShell>;
}
