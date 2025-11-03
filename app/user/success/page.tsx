'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Stripe from 'stripe';

interface AccountDetails {
  accountName: string;
  masterPassword: string;
  seed: string;
  hiveTxId: string;
  bonusAmount?: number;
}

export default function AccountSuccessPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const token = searchParams.get('token'); // For postMessage security

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accountDetails, setAccountDetails] = useState<AccountDetails | null>(null);
  const [credentialsSaved, setCredentialsSaved] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setError('No session ID provided');
      setLoading(false);
      return;
    }

    fetchAccountDetails();
  }, [sessionId]);

  const fetchAccountDetails = async () => {
    try {
      // Fetch session details from an API route that retrieves from Stripe
      const response = await fetch(`/api/session/${sessionId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch account details');
      }

      const data = await response.json();
      const { accountName, seed, masterPassword, hiveTxId, bonusAmount } = data;

      setAccountDetails({
        accountName,
        masterPassword,
        seed,
        hiveTxId,
        bonusAmount,
      });

      // Save to localStorage
      localStorage.setItem('hiveAccount', JSON.stringify({
        accountName,
        masterPassword,
        seed,
        createdAt: new Date().toISOString(),
      }));

      // Send credentials to opener (e.g., indiesmenu) if present
      if (window.opener && accountName && masterPassword) {
        const activeKey = masterPassword; // In production, derive actual active key
        window.opener.postMessage({
          type: 'INNOPAY_WALLET_CREATED',
          token: token,
          username: accountName,
          activeKey: activeKey,
        }, 'https://innopay.lu');
      }

      setLoading(false);
    } catch (err: any) {
      console.error('Error fetching account details:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  const downloadCredentials = () => {
    if (!accountDetails) return;

    const content = `
INNOPAY ACCOUNT CREDENTIALS
============================

Account Name: ${accountDetails.accountName}
Master Password: ${accountDetails.masterPassword}
Seed Phrase: ${accountDetails.seed}

Transaction ID: ${accountDetails.hiveTxId}
${accountDetails.bonusAmount ? `Bonus Received: ${accountDetails.bonusAmount} EURO tokens\n` : ''}
Created: ${new Date().toISOString()}

IMPORTANT: Keep these credentials safe and secure!
- Never share your master password or seed phrase with anyone
- Store this information in a secure location
- You can use these credentials to access your Hive account
- Visit https://hive.blog to use your account

Generated with Innopay - https://innopay.lu
`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `innopay-${accountDetails.accountName}-credentials.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setCredentialsSaved(true);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    alert(`${label} copied to clipboard!`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Creating your account...</p>
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
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Success Header */}
        <div className="text-center mb-8">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
            <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 mb-2">
            Account Created Successfully!
          </h1>
          <p className="text-lg text-gray-600">
            Welcome to Hive, {accountDetails?.accountName}!
          </p>
          {accountDetails?.bonusAmount && accountDetails.bonusAmount > 0 && (
            <div className="mt-4 inline-block px-4 py-2 bg-yellow-100 rounded-full">
              <p className="text-yellow-800 font-semibold">
                🎉 Bonus: {accountDetails.bonusAmount} EURO tokens added to your account!
              </p>
            </div>
          )}
        </div>

        {/* Warning Banner */}
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">Important!</h3>
              <p className="mt-1 text-sm text-yellow-700">
                Save your credentials now. This is the only time you'll see them in full.
              </p>
            </div>
          </div>
        </div>

        {/* Credentials Display */}
        {accountDetails && (
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Your Account Credentials</h2>

            {/* Account Name */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account Name
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={accountDetails.accountName}
                  readOnly
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 font-mono text-sm"
                />
                <button
                  onClick={() => copyToClipboard(accountDetails.accountName, 'Account name')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                >
                  Copy
                </button>
              </div>
            </div>

            {/* Master Password */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Master Password
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={accountDetails.masterPassword}
                  readOnly
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 font-mono text-sm"
                />
                <button
                  onClick={() => copyToClipboard(accountDetails.masterPassword, 'Master password')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                >
                  Copy
                </button>
              </div>
            </div>

            {/* Seed Phrase */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Seed Phrase (12 words)
              </label>
              <div className="flex items-center space-x-2">
                <textarea
                  value={accountDetails.seed}
                  readOnly
                  rows={2}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 font-mono text-sm"
                />
                <button
                  onClick={() => copyToClipboard(accountDetails.seed, 'Seed phrase')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                >
                  Copy
                </button>
              </div>
            </div>

            {/* Download Button */}
            <div className="mt-6">
              <button
                onClick={downloadCredentials}
                className="w-full px-4 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 font-semibold flex items-center justify-center space-x-2"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Download Credentials</span>
              </button>
            </div>
          </div>
        )}

        {/* Next Steps */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Next Steps</h2>
          <ul className="space-y-3">
            <li className="flex items-start">
              <span className="flex-shrink-0 h-6 w-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-semibold mr-3">
                1
              </span>
              <span className="text-gray-700">
                <strong>Save your credentials</strong> in a secure password manager or encrypted storage
              </span>
            </li>
            <li className="flex items-start">
              <span className="flex-shrink-0 h-6 w-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-semibold mr-3">
                2
              </span>
              <span className="text-gray-700">
                <strong>Complete your profile</strong> to earn RUBIS tokens (optional)
              </span>
            </li>
            <li className="flex items-start">
              <span className="flex-shrink-0 h-6 w-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-semibold mr-3">
                3
              </span>
              <span className="text-gray-700">
                <strong>Explore Hive</strong> at{' '}
                <a href="https://hive.blog" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  hive.blog
                </a>
              </span>
            </li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-4">
          <a
            href="/user"
            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold text-center"
          >
            Complete Profile (Earn RUBIS)
          </a>
          <a
            href="/"
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-semibold"
          >
            Home
          </a>
        </div>

        {/* Credential Saved Confirmation */}
        {credentialsSaved && (
          <div className="mt-6 rounded-md bg-green-50 p-4">
            <p className="text-sm text-green-700 text-center">
              ✓ Credentials downloaded successfully!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
