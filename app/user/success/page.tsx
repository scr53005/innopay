'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

interface AccountCredentials {
  accountName: string;
  masterPassword: string;
  euroBalance: number;
  keys: {
    owner: { privateKey: string; publicKey: string };
    active: { privateKey: string; publicKey: string };
    posting: { privateKey: string; publicKey: string };
    memo: { privateKey: string; publicKey: string };
  };
}

function AccountSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('Creating your account...');

  useEffect(() => {
    if (!sessionId) {
      setError('No session ID provided');
      setLoading(false);
      return;
    }

    pollForCredentials();
  }, [sessionId]);

  const pollForCredentials = async () => {
    try {
      setMessage('Waiting for account creation...');

      // STEP 1: Poll for webhook completion and get credential token
      const pollSession = async (): Promise<{ credentialToken: string; accountName: string }> => {
        const response = await fetch(`/api/account/session?session_id=${sessionId}`);
        const data = await response.json();

        if (!data.ready) {
          // Webhook not complete yet, wait and retry
          await new Promise(resolve => setTimeout(resolve, 1000));
          return pollSession();
        }

        return { credentialToken: data.credentialToken, accountName: data.accountName };
      };

      const { credentialToken, accountName } = await pollSession();
      console.log(`[SUCCESS] Got credential token for account: ${accountName}`);

      setMessage('Account created successfully!');
      setLoading(false);

      // STEP 2: Store token in localStorage for innopay's own use
      localStorage.setItem('innopay_credentialToken', credentialToken);
      localStorage.setItem('innopay_accountName', accountName);

      // STEP 3: Redirect back to indiesmenu with credential token
      const isDev = window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168');
      const baseIndiesMenuUrl = isDev
        ? 'http://192.168.178.55:3001/menu'
        : 'https://indies.innopay.lu/menu';

      // If opened in popup from indiesmenu
      if (window.opener) {
        // Redirect opener to menu page with credential token
        window.opener.location.href = `${baseIndiesMenuUrl}?account_created=true&credential_token=${credentialToken}`;

        // Close popup after a short delay
        setTimeout(() => {
          window.close();
        }, 2000);
      } else {
        // Opened in same window, redirect with credential token
        setTimeout(() => {
          window.location.href = `${baseIndiesMenuUrl}?account_created=true&credential_token=${credentialToken}`;
        }, 2000);
      }

    } catch (err: any) {
      console.error('[SUCCESS] Error retrieving credentials:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">{message}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
        <div className="max-w-md w-full">
          <div className="rounded-md bg-red-50 p-4">
            <h3 className="text-sm font-medium text-red-800">Error</h3>
            <p className="mt-2 text-sm text-red-700">{error}</p>
          </div>
          <div className="mt-4 text-center">
            <a href="/user" className="text-blue-600 hover:text-blue-500">
              Try Again
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
          <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Account Created!</h2>
        <p className="text-gray-600 mb-4">{message}</p>
        <p className="text-sm text-gray-500">Redirecting back to restaurant...</p>
      </div>
    </div>
  );
}

export default function AccountSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <AccountSuccessContent />
    </Suspense>
  );
}
