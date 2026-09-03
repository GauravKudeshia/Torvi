import { DesktopConnectClient } from './desktop-connect-client';

export default async function DesktopConnectPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code = '' } = await searchParams;
  return <DesktopConnectClient initialCode={code} />;
}
