'use client';

export default function ExpiredOrUsedMessage({ reason }: { reason: 'already_used' | 'expired' }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    }}>
      <div style={{ maxWidth: '500px', textAlign: 'center' }}>

        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
          padding: '24px',
          borderRadius: '12px 12px 0 0',
        }}>
          <h1 style={{ color: 'white', margin: 0, fontSize: '24px', fontWeight: 600 }}>Innopay</h1>
        </div>

        {/* Content */}
        <div style={{
          background: '#ffffff',
          padding: '40px',
          border: '1px solid #e5e7eb',
          borderTop: 'none',
          borderRadius: '0 0 12px 12px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>
            {reason === 'already_used' ? '\u26A0\uFE0F' : '\u23F0'}
          </div>

          {/* French */}
          <h2 style={{ color: '#dc2626', fontSize: '20px', marginBottom: '8px' }}>
            {reason === 'already_used'
              ? 'Ce lien a déjà été utilisé'
              : 'Ce lien a expiré'}
          </h2>
          <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>
            {reason === 'already_used'
              ? 'Les identifiants ne peuvent être affichés qu\'une seule fois.'
              : 'Ce lien n\'est plus valide.'}
          </p>

          {/* English */}
          <h2 style={{ color: '#dc2626', fontSize: '20px', marginBottom: '8px' }}>
            {reason === 'already_used'
              ? 'This link has already been used'
              : 'This link has expired'}
          </h2>
          <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '32px' }}>
            {reason === 'already_used'
              ? 'Credentials can only be displayed once.'
              : 'This link is no longer valid.'}
          </p>

          {/* Recovery suggestion */}
          <div style={{
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '24px',
          }}>
            <p style={{ color: '#1e40af', fontSize: '13px', margin: '0 0 6px', fontWeight: 600 }}>
              Besoin d'accéder à vos identifiants ?
            </p>
            <p style={{ color: '#1e40af', fontSize: '13px', margin: 0 }}>
              Utilisez la fonction «&nbsp;<a href="https://wallet.innopay.lu/user" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'underline' }}>Importer un compte</a>&nbsp;» pour récupérer vos identifiants par e-mail.
            </p>
            <hr style={{ border: 'none', borderTop: '1px solid #bfdbfe', margin: '12px 0' }} />
            <p style={{ color: '#1e40af', fontSize: '13px', margin: '0 0 6px', fontWeight: 600 }}>
              Need to access your credentials?
            </p>
            <p style={{ color: '#1e40af', fontSize: '13px', margin: 0 }}>
              Use the «&nbsp;<a href="https://wallet.innopay.lu/user" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'underline' }}>Import Account</a>&nbsp;» feature to recover your credentials by email.
            </p>
          </div>

          <a
            href="/"
            style={{
              display: 'inline-block',
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              color: 'white',
              textDecoration: 'none',
              padding: '12px 32px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            Retour au portefeuille / Back to wallet
          </a>
        </div>
      </div>
    </div>
  );
}
