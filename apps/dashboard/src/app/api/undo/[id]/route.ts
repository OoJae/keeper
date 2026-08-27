/**
 * Undo proxy.
 *
 * The browser never talks to the connector's write endpoint directly. Two reasons:
 *   - the connector's address stays server-side, so a public dashboard does not advertise a
 *     moderation endpoint to everyone who opens devtools;
 *   - the CORS allow-list on the connector stays a single origin, because this is a
 *     same-origin call from the dashboard's own server.
 *
 * The token is NOT stored here. It is supplied per request by whoever is holding it — the
 * creator — and forwarded verbatim. This proxy grants no authority of its own; if the token is
 * wrong the connector refuses, exactly as it would refuse a direct call.
 */
import { NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  }

  const token = request.headers.get('x-keeper-admin-token') ?? '';
  if (token === '') {
    return NextResponse.json(
      { error: 'no_token', detail: 'Undo needs the creator token. Moderation control is not public.' },
      { status: 401 },
    );
  }

  try {
    const res = await fetch(`${API_BASE}/api/actions/${id}/undo`, {
      method: 'POST',
      headers: { 'X-Keeper-Admin-Token': token },
      cache: 'no-store',
    });
    const body: unknown = await res.json().catch(() => ({}));
    return NextResponse.json(body, { status: res.status });
  } catch (error) {
    // The connector being unreachable must read as "the connector is down", not as a failed
    // undo — a creator has to know which of the two happened.
    return NextResponse.json(
      {
        error: 'connector_unreachable',
        detail: `Could not reach the connector at ${API_BASE}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
      { status: 502 },
    );
  }
}
