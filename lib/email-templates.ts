// lib/email-templates.ts
// Multilingual email templates for Innopay verification system

export type Language = 'en' | 'fr' | 'de' | 'lb';

export interface VerificationEmailTemplate {
  subject: string;
  greeting: string;
  message: string;
  codeLabel: string;
  expiryNote: string;
  ignoreNote: string;
  footer: string;
}

export const verificationTemplates: Record<Language, VerificationEmailTemplate> = {
  en: {
    subject: 'Verify your Innopay account',
    greeting: 'Hello,',
    message: 'Your verification code is:',
    codeLabel: 'Verification Code',
    expiryNote: 'This code expires in 10 minutes.',
    ignoreNote: "If you didn't request this, please ignore this email.",
    footer: 'Innopay | Digital Wallet\nwallet.innopay.lu',
  },

  fr: {
    subject: 'Vérifiez votre compte Innopay',
    greeting: 'Bonjour,',
    message: 'Votre code de vérification est :',
    codeLabel: 'Code de vérification',
    expiryNote: 'Ce code expire dans 10 minutes.',
    ignoreNote: "Si vous n'avez pas demandé ceci, veuillez ignorer cet e-mail.",
    footer: 'Innopay | Portefeuille numérique\nwallet.innopay.lu',
  },

  de: {
    subject: 'Verifizieren Sie Ihr Innopay-Konto',
    greeting: 'Hallo,',
    message: 'Ihr Verifizierungscode lautet:',
    codeLabel: 'Verifizierungscode',
    expiryNote: 'Dieser Code läuft in 10 Minuten ab.',
    ignoreNote: 'Wenn Sie dies nicht angefordert haben, ignorieren Sie bitte diese E-Mail.',
    footer: 'Innopay | Digitale Geldbörse\nwallet.innopay.lu',
  },

  lb: {
    subject: 'Verifizéiert Ären Innopay-Kont',
    greeting: 'Moien,',
    message: 'Ären Verifizéierungscode ass:',
    codeLabel: 'Verifizéierungscode',
    expiryNote: 'Dëse Code ass 10 Minutten gülteg.',
    ignoreNote: 'Wann Dir dëst net ugefrot hutt, ignoréiert dës E-Mail w.e.g.',
    footer: 'Innopay | Digital Portmonee\nwallet.innopay.lu',
  },
};

/**
 * Get email template for a specific language
 * Falls back to English if language not found
 */
export function getVerificationTemplate(language: Language = 'en'): VerificationEmailTemplate {
  return verificationTemplates[language] || verificationTemplates.en;
}

/**
 * Build complete email (HTML + text) for verification code
 * @param code - 6-digit verification code
 * @param language - User's preferred language (en, fr, de, lb)
 * @returns Object with subject, html, and text versions
 */
export function buildVerificationEmail(
  code: string,
  language: Language = 'en'
): { subject: string; html: string; text: string } {
  const t = getVerificationTemplate(language);

  // Plain text version (for email clients that don't support HTML)
  const text = `
${t.greeting}

${t.message}

${code}

${t.expiryNote}

${t.ignoreNote}

---
${t.footer}
  `.trim();

  // HTML version with styling
  const html = `
<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">

  <!-- Header with Innopay branding -->
  <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">Innopay</h1>
    <p style="color: rgba(255, 255, 255, 0.9); margin: 8px 0 0 0; font-size: 14px;">Digital Wallet</p>
  </div>

  <!-- Main content -->
  <div style="background: #ffffff; padding: 40px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
    <p style="font-size: 16px; margin-bottom: 20px; color: #374151;">${t.greeting}</p>

    <p style="font-size: 16px; margin-bottom: 10px; color: #374151;">${t.message}</p>

    <!-- Verification code box -->
    <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border: 2px solid #3b82f6; border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0;">
      <div style="font-size: 12px; color: #6b7280; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">${t.codeLabel}</div>
      <div style="font-size: 36px; font-weight: bold; color: #1f2937; letter-spacing: 10px; font-family: 'Courier New', Courier, monospace;">${code}</div>
    </div>

    <p style="font-size: 14px; color: #6b7280; margin-bottom: 10px;">⏱️ ${t.expiryNote}</p>
    <p style="font-size: 14px; color: #9ca3af; font-style: italic;">${t.ignoreNote}</p>
  </div>

  <!-- Footer -->
  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 5px 0;">${t.footer.split('\n')[0]}</p>
    <p style="margin: 5px 0;"><a href="https://wallet.innopay.lu" style="color: #3b82f6; text-decoration: none;">${t.footer.split('\n')[1]}</a></p>
  </div>

</body>
</html>
  `.trim();

  return {
    subject: t.subject,
    html,
    text,
  };
}

/**
 * Detect language from request headers (future use)
 * @param acceptLanguage - Accept-Language header value
 * @returns Detected language code
 */
export function detectLanguageFromHeader(acceptLanguage: string): Language {
  const lang = acceptLanguage.toLowerCase();

  if (lang.includes('fr')) return 'fr';
  if (lang.includes('de')) return 'de';
  if (lang.includes('lb')) return 'lb';

  return 'en'; // Default to English
}
