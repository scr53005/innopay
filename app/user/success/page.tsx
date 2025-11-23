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
        const maxPolls = 90; // Poll for up to 90 seconds (90 polls × 1 second)
        let pollCount = 0;

        while (pollCount < maxPolls) {
          pollCount++;
          console.log(`[ACCOUNT POLL] Attempt ${pollCount}/${maxPolls} for session ${sessionId}`);

          const response = await fetch(`/api/account/session?session_id=${sessionId}`);
          const data = await response.json();

          if (data.ready) {
            console.log(`[ACCOUNT POLL] ✓ Credentials ready!`);
            return { credentialToken: data.credentialToken, accountName: data.accountName };
          }

          // Wait 1 second before next poll
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Timeout reached
        console.error(`[ACCOUNT POLL] ⏱️ Timeout after ${maxPolls} attempts`);
        throw new Error('Account creation is taking longer than expected. Please contact support with your payment confirmation.');
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
          <div className="rounded-md bg-yellow-50 border-2 border-yellow-200 p-6">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-8 w-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium text-yellow-800">Account Creation Delayed</h3>
                <div className="mt-2 text-sm text-yellow-700">
                  <p>{error}</p>
                </div>
                <div className="mt-4">
                  <p className="text-sm text-yellow-800 font-semibold">What happened?</p>
                  <p className="text-xs text-yellow-700 mt-1">
                    Your payment was successful, but account creation is taking longer than usual.
                    This sometimes happens when our servers are processing many requests.
                  </p>
                </div>
                <div className="mt-4">
                  <p className="text-sm text-yellow-800 font-semibold">What to do?</p>
                  <ul className="text-xs text-yellow-700 mt-1 list-disc list-inside space-y-1">
                    <li>Check your email for account confirmation (may arrive in 5-10 minutes)</li>
                    <li>Try the "Import Account" feature on the homepage with your email</li>
                    <li>Contact support if the issue persists</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <a
              href="/"
              className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-lg font-medium text-center hover:bg-blue-700 transition-colors"
            >
              Go to Homepage
            </a>
            <a
              href="/user"
              className="flex-1 bg-gray-200 text-gray-700 px-4 py-3 rounded-lg font-medium text-center hover:bg-gray-300 transition-colors"
            >
              Try Again
            </a>
          </div>
          <div className="mt-4 text-center">
            <p className="text-xs text-gray-500">
              Session ID: {sessionId?.slice(0, 20)}...
            </p>
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
