import crypto from 'node:crypto';

const INTERNAL_TRANSCRIPT_URL =
  process.env.INTERNAL_TRANSCRIPT_URL ?? 'http://127.0.0.1:4001';
const SECRET = process.env.INTERNAL_TRANSCRIPT_SECRET;
const TRANSCRIPT_WEB_URL = (
  process.env.TRANSCRIPT_WEB_URL ?? 'https://tickets.san-andreas-rp.co.uk'
).replace(/\/+$/, '');

/** Public sarp-tickets-web page that shows this ticket's transcript. */
export function transcriptUrl(ticketId: number): string {
  return `${TRANSCRIPT_WEB_URL}/tickets/${ticketId}`;
}

function sign(body: string): string {
  if (!SECRET) throw new Error('INTERNAL_TRANSCRIPT_SECRET not set');
  return 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
}

/** Sends the closed ticket's HTML transcript to sarp-tickets-web for storage. Returns whether it was stored. */
export async function shareTicketTranscript(
  ticketId: number,
  html: string,
): Promise<boolean> {
  const url = `${INTERNAL_TRANSCRIPT_URL}/internal/transcripts/${ticketId}`;
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Signature-256': sign(html),
      },
      body: html,
    });
    if (!res.ok) {
      console.error(`Transcript share failed (${res.status}) for ticket ${ticketId}`);
    }
    return res.ok;
  } catch (err) {
    console.error(`Transcript share error for ticket ${ticketId}:`, err);
    return false;
  }
}
