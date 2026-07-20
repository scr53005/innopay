// Operator notification for a successful vendor hatch (project_hatchery_vendor_hatching).
// Reuses the hub's Resend setup (same as debt-reminders). Sent to
// HATCH_NOTIFY_EMAIL (default contact@innopay.lu) with a go-live checklist.
//
// The Resend client is constructed INSIDE sendHatchNotification (not at module
// load) so the pure buildHatchEmail can be imported by tests without an API key.

export interface HatchEmailParams {
  displayName: string;
  account: string;
  memoVendorId: number;
  env: 'prod' | 'dev';
  tillUrl: string;
  payUrl: string;
  iban: string | null;
}

/** Show only the tail of an IBAN in the notification (full value lives in the DB). */
export function maskIban(iban: string | null): string {
  if (!iban) return '(none provided)';
  const compact = iban.replace(/\s+/g, '');
  return compact.length <= 4 ? compact : `…${compact.slice(-4)}`;
}

/** Pure: build the notification email (subject + text + html). */
export function buildHatchEmail(p: HatchEmailParams): { subject: string; text: string; html: string } {
  const subject = `🐣 New Innopay Farm vendor: ${p.displayName} (@${p.account})${p.env === 'dev' ? ' [dev]' : ''}`;

  const checklist = [
    `Hive account @${p.account} appears in the merchant-hub registry (GET /api/vendors, or the status dashboard)`,
    `merchant-hub is polling @${p.account} — open the till and confirm no errors`,
    `Till URL loads and shows the ${p.env} catalogue: ${p.tillUrl}`,
    `Customer pay page loads: ${p.payUrl}`,
    `Payout IBAN on file (ends ${maskIban(p.iban)}) — SEPA rail is future work`,
    `Run one test order end to end (scan → pay → bell)`,
    p.env === 'dev'
      ? `This is a DEV/test vendor — clean up when done (vendor-watchlist.mjs remove @${p.account}); a real Hive account is permanent on chain`
      : `Print/deploy the QR sticker for the pay page`,
  ];

  const text = [
    `A new Innopay Farm vendor has been hatched.`,
    ``,
    `  Business:  ${p.displayName}`,
    `  Account:   @${p.account}`,
    `  Vendor #:  ${p.memoVendorId} (memo V:)`,
    `  Env:       ${p.env}`,
    `  Till:      ${p.tillUrl}`,
    `  Pay page:  ${p.payUrl}`,
    `  IBAN:      ${maskIban(p.iban)}`,
    ``,
    `Checklist:`,
    ...checklist.map((c) => `  [ ] ${c}`),
    ``,
    `Innopay Farm`,
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <p>A new <strong>Innopay Farm</strong> vendor has been hatched.</p>
      <ul style="list-style:none;padding:0">
        <li><strong>Business:</strong> ${p.displayName}</li>
        <li><strong>Account:</strong> @${p.account}</li>
        <li><strong>Vendor #:</strong> ${p.memoVendorId} (memo <code>V:</code>)</li>
        <li><strong>Env:</strong> ${p.env}</li>
        <li><strong>Till:</strong> <a href="${p.tillUrl}">${p.tillUrl}</a></li>
        <li><strong>Pay page:</strong> <a href="${p.payUrl}">${p.payUrl}</a></li>
        <li><strong>IBAN:</strong> ${maskIban(p.iban)}</li>
      </ul>
      <p><strong>Checklist</strong></p>
      <ul>${checklist.map((c) => `<li>${c}</li>`).join('')}</ul>
      <p>Innopay Farm</p>
    </div>
  `;

  return { subject, text, html };
}

/**
 * Send the notification. Soft-fails: returns 'sent' | 'skipped' | 'failed'
 * and NEVER throws — a mail problem must not fail an otherwise-good hatch.
 */
export async function sendHatchNotification(p: HatchEmailParams): Promise<'sent' | 'skipped' | 'failed'> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return 'skipped';
  const to = process.env.HATCH_NOTIFY_EMAIL || 'contact@innopay.lu';
  const from = process.env.RESEND_FROM_EMAIL || 'noreply@verify.innopay.lu';
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    const { subject, text, html } = buildHatchEmail(p);
    await resend.emails.send({ from, to, subject, text, html });
    return 'sent';
  } catch (e) {
    console.error('[HATCH] notification email failed:', e);
    return 'failed';
  }
}
