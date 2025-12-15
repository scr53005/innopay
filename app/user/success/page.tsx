'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getRestaurantUrl, detectRestaurant } from '@/services/utils';

interface AccountCredentials {
  accountName: string;
  masterPassword: string;
  euroBalance: number;
  email?: string | null;
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
  const [isExternalFlow, setIsExternalFlow] = useState(false);

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

      // STEP 1: Poll for webhook completion and get FULL credentials directly
      const pollSession = async (): Promise<AccountCredentials> => {
        const maxPolls = 90; // Poll for up to 90 seconds (90 polls × 1 second)
        let pollCount = 0;

        while (pollCount < maxPolls) {
          pollCount++;
          console.log(`[ACCOUNT POLL] Attempt ${pollCount}/${maxPolls} for session ${sessionId}`);

          const response = await fetch(`/api/account/session?session_id=${sessionId}`);
          const data = await response.json();

          if (data.ready) {
            console.log(`[ACCOUNT POLL] ✓ Credentials ready!`);
            // Return full credentials object (session_id is used for external flows, not credentialToken)
            return {
              accountName: data.accountName,
              masterPassword: data.masterPassword,
              euroBalance: data.euroBalance,
              email: data.email || null,
              keys: data.keys,
            };
          }

          // Wait 1 second before next poll
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Timeout reached
        console.error(`[ACCOUNT POLL] ⏱️ Timeout after ${maxPolls} attempts`);
        throw new Error('Account creation is taking longer than expected. Please contact support with your payment confirmation.');
      };

      const credentials = await pollSession();
      console.log(`[SUCCESS] Got full credentials for account: ${credentials.accountName}`);

      setMessage('Account created successfully!');
      setLoading(false);

      // STEP 2: Store FULL credentials in localStorage (no need for token!)
      localStorage.setItem('innopay_accountName', credentials.accountName);
      localStorage.setItem('innopay_masterPassword', credentials.masterPassword);
      localStorage.setItem('innopay_activePrivate', credentials.keys.active.privateKey);
      localStorage.setItem('innopay_postingPrivate', credentials.keys.posting.privateKey);
      localStorage.setItem('innopay_memoPrivate', credentials.keys.memo.privateKey);
      localStorage.setItem('innopay_lastBalance', credentials.euroBalance.toString());

      // Store email if available
      if (credentials.email) {
        localStorage.setItem('innopay_email', credentials.email);
        console.log(`[SUCCESS] Stored full credentials in localStorage including email: ${credentials.email}`);
      } else {
        console.log(`[SUCCESS] Stored full credentials in localStorage (no email available)`);
      }

      // STEP 3: Detect which restaurant (if any) the user came from
      const restaurant = detectRestaurant(searchParams);

      if (restaurant) {
        // EXTERNAL FLOW: Redirect back to restaurant with session_id (not credential_token - that's legacy)
        console.log(`[SUCCESS] External flow detected, redirecting to restaurant: ${restaurant}`);
        setIsExternalFlow(true);

        const table = searchParams.get('table');
        const restaurantUrl = getRestaurantUrl(restaurant, '/menu');
        const redirectUrl = `${restaurantUrl}?${table ? `table=${table}&` : ''}account_created=true&session_id=${sessionId}`;

        console.log(`[SUCCESS] Redirecting to: ${redirectUrl}`);

        // If opened in popup from restaurant
        if (window.opener) {
          window.opener.location.href = redirectUrl;
          setTimeout(() => {
            window.close();
          }, 2000);
        } else {
          setTimeout(() => {
            window.location.href = redirectUrl;
          }, 2000);
        }
      } else {
        // INTERNAL FLOW: Stay on wallet.innopay.lu and redirect to /user for celebration
        console.log(`[SUCCESS] Internal flow detected, staying on wallet.innopay.lu`);
        setIsExternalFlow(false);
        setMessage('Redirecting to your account...');

        // Get amount parameter to preserve for optimistic balance display
        const amountParam = searchParams.get('amount');

        setTimeout(() => {
          // Redirect to /user page to show confetti, metadata form, and RUBIS opportunity
          const redirectUrl = amountParam
            ? `/user?account_created=true&amount=${amountParam}`
            : `/user?account_created=true`;

          console.log(`[SUCCESS] Redirecting to: ${redirectUrl}`);
          window.location.href = redirectUrl;
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
        <p className="text-sm text-gray-500">
          {isExternalFlow ? 'Redirecting back to restaurant...' : 'Redirecting to your wallet...'}
        </p>
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
