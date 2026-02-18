'use client';

import { useState, useEffect, useCallback } from 'react';

interface Credentials {
  // Displayed to user
  accountName: string;
  creationDate: string;
  seed: string;
  masterPassword: string;
  // Hidden — for localStorage write only
  ownerPrivate: string;
  ownerPublic: string;
  activePrivate: string;
  activePublic: string;
  postingPrivate: string;
  postingPublic: string;
  memoPrivate: string;
  memoPublic: string;
  email: string;
}

export default function CredentialDisplay({ credentials }: { credentials: Credentials }) {
  const [secondsLeft, setSecondsLeft] = useState(15 * 60); // 15 minutes
  const [copied, setCopied] = useState<Record<string, boolean>>({});

  const writeToLocalStorageAndRedirect = useCallback(() => {
    // Write all keys matching the convention in lib/credential-session.ts
    localStorage.setItem('innopay_accountName', credentials.accountName);
    localStorage.setItem('innopay_masterPassword', credentials.masterPassword);
    localStorage.setItem('innopay_ownerPrivate', credentials.ownerPrivate);
    localStorage.setItem('innopay_ownerPublic', credentials.ownerPublic);
    localStorage.setItem('innopay_activePrivate', credentials.activePrivate);
    localStorage.setItem('innopay_activePublic', credentials.activePublic);
    localStorage.setItem('innopay_postingPrivate', credentials.postingPrivate);
    localStorage.setItem('innopay_postingPublic', credentials.postingPublic);
    localStorage.setItem('innopay_memoPrivate', credentials.memoPrivate);
    localStorage.setItem('innopay_memoPublic', credentials.memoPublic);
    if (credentials.email) {
      localStorage.setItem('innopay_email', credentials.email);
    }
    // Redirect to wallet main page (same domain — wallet.innopay.lu)
    window.location.href = '/';
  }, [credentials]);

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          writeToLocalStorageAndRedirect();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [writeToLocalStorageAndRedirect]);

  const copyToClipboard = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(prev => ({ ...prev, [key]: true }));
    setTimeout(() => setCopied(prev => ({ ...prev, [key]: false })), 2000);
  };

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const progressPercent = (secondsLeft / (15 * 60)) * 100;

  const formattedDate = new Date(credentials.creationDate).toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const displayFields = [
    { label: 'Nom du compte / Account Name', key: 'accountName', value: credentials.accountName },
    { label: 'Date de creation / Creation Date', key: 'creationDate', value: formattedDate },
    { label: 'Seed (phrase de recuperation / recovery phrase)', key: 'seed', value: credentials.seed },
    { label: 'Mot de passe principal / Master Password', key: 'masterPassword', value: credentials.masterPassword },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
      padding: '20px',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    }}>
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
          padding: '24px',
          borderRadius: '12px 12px 0 0',
          textAlign: 'center',
        }}>
          <h1 style={{ color: 'white', margin: 0, fontSize: '24px', fontWeight: 600 }}>Innopay</h1>
          <p style={{ color: 'rgba(255,255,255,0.9)', margin: '6px 0 0', fontSize: '14px' }}>
            Identifiants de votre compte / Your account credentials
          </p>
        </div>

        {/* Progress bar + timer */}
        <div style={{
          background: '#1e293b',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{
              background: '#334155',
              borderRadius: '4px',
              height: '8px',
              overflow: 'hidden',
            }}>
              <div style={{
                background: progressPercent > 20 ? '#3b82f6' : '#ef4444',
                height: '100%',
                width: `${progressPercent}%`,
                transition: 'width 1s linear',
                borderRadius: '4px',
              }} />
            </div>
          </div>
          <div style={{
            color: progressPercent > 20 ? '#93c5fd' : '#fca5a5',
            fontFamily: "'Courier New', monospace",
            fontSize: '20px',
            fontWeight: 'bold',
            minWidth: '60px',
            textAlign: 'right',
          }}>
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </div>
        </div>

        {/* Main content */}
        <div style={{
          background: '#ffffff',
          padding: '32px',
          border: '1px solid #e5e7eb',
          borderTop: 'none',
          borderRadius: '0 0 12px 12px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
        }}>

          {/* Warning */}
          <div style={{
            background: '#fffbeb',
            border: '2px solid #f59e0b',
            borderRadius: '10px',
            padding: '16px',
            marginBottom: '24px',
          }}>
            <p style={{ color: '#92400e', margin: '0 0 8px', fontSize: '14px', fontWeight: 600 }}>
              Copiez et sauvegardez ces identifiants maintenant. Cette page ne peut pas etre revisitee.
            </p>
            <p style={{ color: '#92400e', margin: 0, fontSize: '14px' }}>
              Copy and save these credentials now. This page cannot be revisited.
            </p>
          </div>

          {/* Credential fields */}
          {displayFields.map(field => (
            <div key={field.key} style={{
              marginBottom: '20px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              overflow: 'hidden',
            }}>
              <div style={{
                background: '#f8fafc',
                padding: '8px 16px',
                borderBottom: '1px solid #e5e7eb',
                fontSize: '12px',
                fontWeight: 600,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                {field.label}
              </div>
              <div style={{
                padding: '12px 16px',
                display: 'flex',
                alignItems: field.key === 'seed' ? 'flex-start' : 'center',
                gap: '12px',
              }}>
                {field.key === 'seed' ? (
                  <div style={{ flex: 1 }}>
                    <table style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontFamily: "'Courier New', monospace",
                      fontSize: '14px',
                    }}>
                      <tbody>
                        {[0, 1, 2].map(row => (
                          <tr key={row}>
                            {[0, 1, 2, 3].map(col => {
                              const idx = row * 4 + col;
                              const words = field.value.split(/\s+/);
                              const word = words[idx] || '';
                              return (
                                <td key={col} style={{
                                  border: '1px solid #e2e8f0',
                                  padding: '8px 10px',
                                  textAlign: 'center',
                                  background: idx % 2 === 0 ? '#f8fafc' : '#ffffff',
                                  color: '#1e293b',
                                  fontWeight: 500,
                                }}>
                                  <span style={{ color: '#94a3b8', fontSize: '10px', marginRight: '4px' }}>{idx + 1}.</span>
                                  {word}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{
                    flex: 1,
                    fontFamily: "'Courier New', monospace",
                    fontSize: '15px',
                    color: '#1e293b',
                    wordBreak: 'break-all',
                    lineHeight: 1.5,
                  }}>
                    {field.value}
                  </div>
                )}
                <button
                  onClick={() => copyToClipboard(field.key, field.value)}
                  style={{
                    background: copied[field.key] ? '#22c55e' : '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    transition: 'background 0.2s',
                  }}
                >
                  {copied[field.key] ? 'Copie !' : 'Copier'}
                </button>
              </div>
            </div>
          ))}

          {/* Save & continue button */}
          <div style={{ textAlign: 'center', marginTop: '32px' }}>
            <button
              onClick={writeToLocalStorageAndRedirect}
              style={{
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                padding: '16px 40px',
                fontSize: '16px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
              onMouseOver={e => {
                (e.target as HTMLButtonElement).style.transform = 'translateY(-2px)';
              }}
              onMouseOut={e => {
                (e.target as HTMLButtonElement).style.transform = 'translateY(0)';
              }}
            >
              Sauvegarder dans le portefeuille / Save to wallet
            </button>
            <p style={{ color: '#9ca3af', fontSize: '13px', marginTop: '12px' }}>
              Sauvegarde automatique éphémère à la fin du compte à rebours /
              Ephemeral auto-save when the countdown ends
            </p>
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', padding: '20px', color: '#9ca3af', fontSize: '12px' }}>
          <p style={{ margin: '5px 0' }}>Innopay | Digital Wallet</p>
          <p style={{ margin: '5px 0' }}>
            <a href="https://wallet.innopay.lu" style={{ color: '#3b82f6', textDecoration: 'none' }}>
              wallet.innopay.lu
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
