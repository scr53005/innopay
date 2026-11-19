// Copy for /user/email (HUB-USER-FEATURES-PLAN §2). Kept out of the page so the
// error mapping is testable.

export type EmailChangeLanguage = 'en' | 'fr' | 'de' | 'lb';

export type EmailChangeErrorKey =
  | 'invalidEmail' | 'sameEmail' | 'emailTaken' | 'notLinked' | 'proof'
  | 'cooldown' | 'tooMany' | 'wrongCode' | 'noCode' | 'sendFailed' | 'generic';

/** API answer → message key. `{s}` (seconds) and `{n}` (attempts left) are filled in by the page. */
export function emailChangeErrorKey(status: number, error: string | undefined): EmailChangeErrorKey {
  switch (error) {
    case 'invalid_email': return 'invalidEmail';
    case 'same_email': return 'sameEmail';
    case 'email_taken': return 'emailTaken';
    case 'not_linked': return 'notLinked';
    case 'cooldown': return 'cooldown';
    case 'too_many_requests': case 'too_many_attempts': return 'tooMany';
    case 'wrong_code': return 'wrongCode';
    case 'no_pending_code': return 'noCode';
    case 'email_send_failed': return 'sendFailed';
    case 'proof_expired': case 'proof_already_used': case 'bad_signature': case 'account_not_found': case 'invalid_proof':
      return 'proof';
    default: return status === 429 ? 'tooMany' : 'generic';
  }
}

interface Copy {
  entryLink: string; title: string; intro: string; current: string; newEmailLabel: string; sendCode: string;
  codeSent: string; confirm: string; back: string; done: string; backToWallet: string; noWallet: string;
  errors: Record<EmailChangeErrorKey, string>;
}

export const emailChangeMessages: Record<EmailChangeLanguage, Copy> = {
  fr: {
    entryLink: 'Plus accès ? Changer',
    title: 'Changer mon e-mail de récupération',
    intro: "Plus accès à l'e-mail de votre compte ? Indiquez-en un nouveau : votre portefeuille sur cet appareil prouve que le compte est à vous.",
    current: 'actuel :',
    newEmailLabel: 'Nouvel e-mail',
    sendCode: 'Envoyer un code',
    codeSent: 'Code envoyé à',
    confirm: 'Confirmer',
    back: 'Changer d’adresse',
    done: 'C’est fait. Votre compte se récupère désormais avec',
    backToWallet: 'Retour au portefeuille',
    noWallet: 'Votre portefeuille n’est pas sur cet appareil. Écrivez-nous :',
    errors: {
      invalidEmail: 'Adresse e-mail invalide.',
      sameEmail: 'C’est déjà votre adresse.',
      emailTaken: 'Cette adresse appartient à un autre compte Innopay. Écrivez à contact@innopay.lu.',
      notLinked: 'Ce portefeuille n’a pas d’e-mail Innopay à changer.',
      proof: 'La vérification du portefeuille a échoué. Réessayez.',
      cooldown: 'Patientez {s} s avant de redemander un code.',
      tooMany: 'Trop d’essais. Réessayez dans une heure.',
      wrongCode: 'Code incorrect. Encore {n} essai(s).',
      noCode: 'Code expiré. Demandez-en un nouveau.',
      sendFailed: 'Impossible d’envoyer l’e-mail à cette adresse.',
      generic: 'Une erreur est survenue. Réessayez.',
    },
  },
  en: {
    entryLink: 'No access? Change it',
    title: 'Change my recovery email',
    intro: 'No longer have access to your account’s email? Enter a new one: the wallet on this device proves the account is yours.',
    current: 'current:',
    newEmailLabel: 'New email',
    sendCode: 'Send a code',
    codeSent: 'Code sent to',
    confirm: 'Confirm',
    back: 'Use another address',
    done: 'Done. Your account is now recovered with',
    backToWallet: 'Back to the wallet',
    noWallet: 'Your wallet is not on this device. Write to us:',
    errors: {
      invalidEmail: 'Invalid email address.',
      sameEmail: 'That is already your address.',
      emailTaken: 'This address belongs to another Innopay account. Write to contact@innopay.lu.',
      notLinked: 'This wallet has no Innopay email to change.',
      proof: 'The wallet check failed. Please try again.',
      cooldown: 'Wait {s} s before asking for another code.',
      tooMany: 'Too many attempts. Try again in an hour.',
      wrongCode: 'Wrong code. {n} attempt(s) left.',
      noCode: 'Code expired. Ask for a new one.',
      sendFailed: 'We could not send an email to this address.',
      generic: 'Something went wrong. Please try again.',
    },
  },
  de: {
    entryLink: 'Kein Zugriff? Ändern',
    title: 'Wiederherstellungs-E-Mail ändern',
    intro: 'Kein Zugriff mehr auf die E-Mail Ihres Kontos? Geben Sie eine neue ein: Die Geldbörse auf diesem Gerät beweist, dass das Konto Ihnen gehört.',
    current: 'aktuell:',
    newEmailLabel: 'Neue E-Mail',
    sendCode: 'Code senden',
    codeSent: 'Code gesendet an',
    confirm: 'Bestätigen',
    back: 'Andere Adresse',
    done: 'Erledigt. Ihr Konto wird jetzt wiederhergestellt mit',
    backToWallet: 'Zurück zur Geldbörse',
    noWallet: 'Ihre Geldbörse ist nicht auf diesem Gerät. Schreiben Sie uns:',
    errors: {
      invalidEmail: 'Ungültige E-Mail-Adresse.',
      sameEmail: 'Das ist bereits Ihre Adresse.',
      emailTaken: 'Diese Adresse gehört zu einem anderen Innopay-Konto. Schreiben Sie an contact@innopay.lu.',
      notLinked: 'Diese Geldbörse hat keine Innopay-E-Mail zum Ändern.',
      proof: 'Die Prüfung der Geldbörse ist fehlgeschlagen. Bitte erneut versuchen.',
      cooldown: 'Bitte {s} s warten, bevor Sie einen neuen Code anfordern.',
      tooMany: 'Zu viele Versuche. In einer Stunde erneut versuchen.',
      wrongCode: 'Falscher Code. Noch {n} Versuch(e).',
      noCode: 'Code abgelaufen. Fordern Sie einen neuen an.',
      sendFailed: 'An diese Adresse konnte keine E-Mail gesendet werden.',
      generic: 'Ein Fehler ist aufgetreten. Bitte erneut versuchen.',
    },
  },
  lb: {
    entryLink: 'Keen Zougang? Änneren',
    title: 'Meng Recuperatiouns-E-Mail änneren',
    intro: 'Keen Zougang méi op d’E-Mail vun Ärem Kont? Gitt eng nei an: de Portmonee op dësem Apparat beweist, datt de Kont Ären ass.',
    current: 'aktuell:',
    newEmailLabel: 'Nei E-Mail',
    sendCode: 'Code schécken',
    codeSent: 'Code geschéckt un',
    confirm: 'Confirméieren',
    back: 'Aner Adress',
    done: 'Gemaach. Äre Kont gëtt elo recuperéiert mat',
    backToWallet: 'Zréck op de Portmonee',
    noWallet: 'Äre Portmonee ass net op dësem Apparat. Schreift eis:',
    errors: {
      invalidEmail: 'Ongülteg E-Mail-Adress.',
      sameEmail: 'Dat ass schonn Är Adress.',
      emailTaken: 'Dës Adress gehéiert zu engem anere Innopay-Kont. Schreift un contact@innopay.lu.',
      notLinked: 'Dëse Portmonee huet keng Innopay-E-Mail fir ze änneren.',
      proof: 'D’Iwwerpréiwung vum Portmonee ass feelgeschloen. Probéiert nach eng Kéier.',
      cooldown: 'Waart {s} s ier Dir en neie Code ufrot.',
      tooMany: 'Ze vill Versich. Probéiert an enger Stonn nach eng Kéier.',
      wrongCode: 'Falsche Code. Nach {n} Versuch(er).',
      noCode: 'Code ofgelaf. Frot en neien un.',
      sendFailed: 'Mir konnten keng E-Mail un dës Adress schécken.',
      generic: 'E Feeler ass geschitt. Probéiert nach eng Kéier.',
    },
  },
};
