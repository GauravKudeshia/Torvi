import { LiveSession } from './live-session';

export default async function LiveSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LiveSession sessionId={id} />;
}
