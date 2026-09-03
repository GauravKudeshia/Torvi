import { json } from '@/lib/http';

export async function GET() {
  return json({
    status: 'ok',
    service: 'interview-copilot-api',
    version: 'v1',
    time: new Date().toISOString(),
  });
}
