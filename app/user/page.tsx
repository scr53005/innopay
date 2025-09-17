'use client';

import { useState } from 'react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

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

  const [isUsernameValid, setIsUsernameValid] = useState(false);

  const validateAndHandleInput = (input: string) => {
    const lowerCaseInput = input.toLowerCase();
    setAccountName(lowerCaseInput);
    
    setError('');
    toast.dismiss('validation-toast');
    
    const hiveNameRegex = /^[a-z]{2}[a-z0-9-.]{0,12}[a-z0-9]$/;
    const forbiddenCharsRegex = /[^a-z0-9-.]/;

    let isValid = true;
    let message = '';
    
    if (lowerCaseInput.length < 3) {
      message = 'A Hive username has at least three lowercase letters.';
      isValid = false;
    } else if (lowerCaseInput.length > 15) {
      message = `The total length must not exceed 15 characters (you entered: ${lowerCaseInput.length} characters)`;
      isValid = false;
    } else if (forbiddenCharsRegex.test(lowerCaseInput)) {
      message = "Non-permitted characters detected. Only lowercase letters, numbers, dashes, and dots are allowed.";
      isValid = false;
    } else if ((lowerCaseInput.match(/\./g) || []).length > 1) {
      message = "Only one dot is permitted.";
      isValid = false;
    } else if (!hiveNameRegex.test(lowerCaseInput)) {
      message = "A valid Hive username must start with three letters and end with a letter or number.";
      isValid = false;
    }
    
    if (isValid && lowerCaseInput.length >= 3) {
      toast.success("Looks good! Click the button to create your account.", { toastId: 'validation-toast' });
    } else if (message) {
      toast.error(message, { toastId: 'validation-toast' });
    } else {
      toast.dismiss('validation-toast');
    }

    setIsUsernameValid(isValid);
  };
  
  const handleCreateAccount = async () => {
    setError('');
    setSuccess(false);
    setLoading(true);
    setResults({ accountName: '', seed: '', masterPassword: '' });
    toast.dismiss('validation-toast');

    const formattedName = accountName.toLowerCase();
    
    try {
      console.log('Sending request to server for account creation...');

      // Call the API route to handle the server-side creation and existence check
      const response = await fetch('/api/create-hive-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accountName: formattedName }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create Hive account.');
      }

      const data = await response.json();
      const { accountName: returnedAccountName, seed, masterPassword } = data;
      
      if (returnedAccountName !== formattedName) {
        console.error('Data Mismatch Error: The account name returned from the server does not match the one sent.');
        throw new Error('Server returned an unexpected account name. Please try again.');
      }
      
      const formattedSeed = seed.split(' ').map((word: string, index: number) => `${index + 1}.${word}`).join(' ');
      setResults({
        accountName: returnedAccountName,
        seed: formattedSeed,
        masterPassword: masterPassword,
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
        <h1 className="text-4xl font-bold mb-6">Create Your Innopay Account</h1>
        <p className="mt-3 text-xl mb-8">
          Enter a desired username to create your new Innopay account on the Hive blockchain.
        </p>
        
        <div className="w-full max-w-md relative">
          <input
            type="text"
            value={accountName}
            onChange={(e) => validateAndHandleInput(e.target.value)}
            onFocus={() => {
              if (accountName.length > 0) {
                validateAndHandleInput(accountName);
              }
            }}
            placeholder="Choose a username"
            className="w-full p-4 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
          />
          <button
            onClick={handleCreateAccount}
            disabled={loading || !isUsernameValid}
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
      <ToastContainer
        position="top-center"
        autoClose={3000}
        hideProgressBar={true}
        newestOnTop={true}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
    </div>
  );
}