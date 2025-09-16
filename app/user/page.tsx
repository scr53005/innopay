'use client';

import { useState } from 'react';
import { getSeed, generateHiveKeys, accountExists, Keychain } from '@/services/hive';

// A separate API route will handle the actual account creation to keep private keys server-side.
// We'll create this route in the next step.
async function createHiveAccount(accountName: string, keychain: Keychain): Promise<string> {
  const response = await fetch('/api/create-hive-account', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ accountName, keychain }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to create Hive account.');
  }

  const data = await response.json();
  return data.transactionId;
}

export default function HiveAccountCreationPage() {
  const [accountName, setAccountName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [results, setResults] = useState({
    accountName: '',
    seed: '',
    masterPassword: '',
  });

  const handleCreateAccount = async () => {
    setError('');
    setSuccess(false);
    setLoading(true);
    setResults({ accountName: '', seed: '', masterPassword: '' });

    // Step 1: Hive account name validation
    const formattedName = accountName.toLowerCase();
    const hiveNameRegex = /^[a-z]{3,15}[0-9-.]*[a-z0-9]$/;

    if (formattedName.length < 3 || formattedName.length > 15) {
      setError('Username must be between 3 and 15 characters.');
      setLoading(false);
      return;
    }

    if (!hiveNameRegex.test(formattedName)) {
      setError('Invalid username format. Must start with three letters and contain only lowercase letters, numbers, and at most one dot or dash.');
      setLoading(false);
      return;
    }

    try {
      // Step 2: Check if the account name exists on the blockchain
      const exists = await accountExists(formattedName);
      if (exists) {
        setError("This account exists already, is it yours? If it is, do you still have its keys? If it's not, you'll need to pick a different account name as account names are unique.");
        setLoading(false);
        return;
      }

      // Step 3: Generate seed and keys
      const seed = getSeed(formattedName);
      const keychain = generateHiveKeys(formattedName, seed);
      
      // Step 4: Call the API route to create and broadcast the account transaction
      const transactionId = await createHiveAccount(formattedName, keychain);

      // Step 5: Display the results
      const formattedSeed = seed.split(' ').map((word, index) => `${index + 1}.${word}`).join(' ');
      setResults({
        accountName: formattedName,
        seed: formattedSeed,
        masterPassword: keychain.masterPassword,
      });
      setSuccess(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred during account creation.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2">
      <main className="flex flex-col items-center justify-center w-full flex-1 px-20 text-center">
        <h1 className="text-4xl font-bold mb-6">Create Your Hive Account</h1>
        <p className="mt-3 text-xl mb-8">
          Enter a desired username to create your new Innopay account on the Hive blockchain.
        </p>
        
        <div className="w-full max-w-md">
          <input
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="Choose a username"
            className="w-full p-4 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
          />
          <button
            onClick={handleCreateAccount}
            disabled={loading}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 px-6 rounded-lg transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating Account...' : 'Create Innopay Account'}
          </button>
        </div>

        {error && (
          <div className="mt-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg max-w-md">
            <p className="font-bold">Error:</p>
            <p>{error}</p>
          </div>
        )}

        {success && (
          <div className="mt-6 p-6 bg-green-100 border border-green-400 text-green-700 rounded-lg max-w-xl text-left">
            <h2 className="text-2xl font-bold mb-2">🎉 Account Created Successfully!</h2>
            <p className="mb-4">
              <span className="font-bold">Account Name:</span> {results.accountName}
            </p>
            <div className="mb-4 bg-gray-50 p-4 rounded-lg border border-dashed border-gray-300">
              <p className="font-bold text-lg mb-2">IMPORTANT: Save Your Seed Phrase and Master Password</p>
              <p className="text-sm">
                Write down the following 12-word seed phrase and master password and store them in a secure place. This is the only way to recover your account.
              </p>
              <p className="mt-2 text-blue-800 font-mono break-all">{results.seed}</p>
              <p className="mt-2 text-red-800 font-mono break-all">
                <span className="font-bold text-red-900">Master Password:</span> {results.masterPassword}
              </p>
            </div>
            <p>
              Your new Hive account is now live on the blockchain.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}