'use client';

import { useState, useEffect, useRef } from 'react';
import { ToastContainer } from 'react-toastify'; // Kept import, but not using for validation; remove if unused
import 'react-toastify/dist/ReactToastify.css';
import confetti from 'canvas-confetti';

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
  const [validationMessage, setValidationMessage] = useState('');
  const [isValidationSuccess, setIsValidationSuccess] = useState(false);

  const [hasBackedUp, setHasBackedUp] = useState(false);
  // New state for checkboxes
  const [mockAccountCreation, setMockAccountCreation] = useState(false);
  const [forcePaidCreation, setForcePaidCreation] = useState(false);

  const modalRef = useRef<HTMLDialogElement>(null);

  const validateAndHandleInput = (input: string) => {
    const lowerCaseInput = input.toLowerCase();
    setAccountName(lowerCaseInput);
    
    setError('');
    
    let isValid = true;
    let message = '';
    
    // Hive rules: length 3-16, lowercase a-z/0-9/./-, dot-separated labels
    if (lowerCaseInput.length < 3) {
      message = 'Hive usernames must be at least 3 characters long.';
      isValid = false;
    } else if (lowerCaseInput.length > 16) {
      message = `Hive usernames must not exceed 16 characters (you entered: ${lowerCaseInput.length}).`;
      isValid = false;
    } else {
      // Allowed chars check
      const allowedCharsRegex = /^[a-z0-9.-]+$/;
      if (!allowedCharsRegex.test(lowerCaseInput)) {
        message = 'Only lowercase letters (a-z), numbers (0-9), dots (.), and hyphens (-) are allowed.';
        isValid = false;
      } else {
        // Split into labels by dot and validate each
        const labels = lowerCaseInput.split('.');
        if (labels.some(label => label.length === 0)) {
          message = 'No consecutive dots or leading/trailing dots allowed.';
          isValid = false;
        } else if (labels.some(label => label.length < 3)) {
          message = 'Each segment (between dots) must be at least 3 characters.';
          isValid = false;
        } else if (labels.some(label => !/^[a-z]/.test(label))) {
          message = 'Each segment must start with a lowercase letter.';
          isValid = false;
        } else if (labels.some(label => !/[a-z0-9]$/.test(label))) {
          message = 'Each segment must end with a lowercase letter or number.';
          isValid = false;
        } else if (labels.some(label => /^-|-{2,}|-$/.test(label))) {
          message = 'Hyphens cannot be at the start/end of a segment or consecutive.';
          isValid = false;
        }
      }
    }
    
    if (isValid && lowerCaseInput.length >= 3) {
      setValidationMessage("Looks good! Click the button to create your account.");
      setIsValidationSuccess(true);
    } else if (message) {
      setValidationMessage(message);
      setIsValidationSuccess(false);
    } else {
      setValidationMessage('');
    }

    setIsUsernameValid(isValid);
  };
  
  const handleCreateAccount = async () => {
    setError('');
    setSuccess(false);
    setLoading(true);
    setResults({ accountName: '', seed: '', masterPassword: '' });
    setValidationMessage(''); // Clear validation message on submit

    const formattedName = accountName.toLowerCase();
    
    try {
      console.log('Sending request to server for account creation...');

      const response = await fetch('/api/create-hive-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          accountName: formattedName,
          mockBroadcast: mockAccountCreation, // Send mock flag to server
          simulateClaimedFailure: forcePaidCreation,   // Send force paid flag to server 
        }),
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

  const triggerConfetti = () => {
    const duration = 5000; // 5 seconds of confetti rain
    const animationEnd = Date.now() + duration;
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#dd00ff']; // Bright, vibrant colors

    const frame = () => {
      confetti({
        particleCount: 4, // Fewer per frame for performance during loop
        angle: 60, // Slight angle for natural spread from left
        spread: 55,
        startVelocity: 90, // Higher initial speed to cover the page
        decay: 0.94, // Slower deceleration for longer motion
        gravity: 0.9, // Slower fall to reach bottom
        ticks: 600, // Longer particle life
        origin: { x: 0, y: 0 }, // Upper left
        colors: colors, // Bright custom colors
        zIndex: 1000, // Ensure on top
      });

      if (Date.now() < animationEnd) {
        requestAnimationFrame(frame);
      }
    };

    frame();
  };

  // Trigger confetti on success
  useEffect(() => {
    if (success) {
      triggerConfetti();
    }
  }, [success]);

  // Show modal on success
  useEffect(() => {
    if (success) {
      modalRef.current?.showModal();
    }
  }, [success]);

  // Beforeunload listener if success and not backed up
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
     // Modern browsers ignore custom messages, but setting returnValue to an empty string triggers the default dialog
      e.returnValue = '';
    };

    if (success && !hasBackedUp) {
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }
  }, [success, hasBackedUp]);

  const innopayLogoUrl = "/innopay.svg";

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2">
      <main className="flex flex-col items-center justify-center w-full flex-1 px-20 text-center">
        <div className="flex flex-col items-center space-y-8 p-8 bg-white rounded-xl shadow-lg w-full max-w-md mb-6">
          {/* Innopay Logo */}
          <img
            src={innopayLogoUrl}
            alt="Innopay Logo"
            className="w-144 h-auto rounded-lg"
          />
        </div>  
        <h1 className="text-4xl font-bold mb-6">Create Your Innopay Account</h1>
        <p className="mt-3 text-xl mb-8">
          Enter a desired username to create your new Innopay account on the Hive blockchain.
        </p>
        
        <div className="w-full max-w-md relative">
          {/* Validation callout (appears above input if message exists) */}
          {validationMessage && (
            <div className={`absolute -top-12 left-0 w-full p-3 rounded-lg shadow-md text-center validation-callout z-10
              ${isValidationSuccess ? 'bg-green-100/80 text-green-800' : 'bg-red-100/80 text-red-800'}`}>
              {validationMessage}
            </div>
          )}

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
            className={`w-full p-4 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 transition-colors duration-300
              ${accountName.length > 0 ? (isUsernameValid ? 'bg-green-200/50' : 'bg-red-200/50') : ''}`}
          />
          {/* Checkboxes for mocking and forcing HIVE creation */}
          <div className="flex flex-col space-y-2 mb-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={mockAccountCreation}
                onChange={(e) => setMockAccountCreation(e.target.checked)}
                className="h-4 w-4 text-blue-500 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="text-sm text-gray-700">Mock account creation</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={forcePaidCreation}
                onChange={(e) => setForcePaidCreation(e.target.checked)}
                className="h-4 w-4 text-blue-500 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="text-sm text-gray-700">Force creation with HIVE</span>
            </label>
          </div>

          <button
            onClick={handleCreateAccount}
            disabled={loading || !isUsernameValid}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 px-6 rounded-lg transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating Account...' : 'Create Innopay Account'}
          </button>

          {/* Temporary test button - comment out when done 
          <button
            onClick={triggerConfetti}
            className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-4 px-6 rounded-lg transition duration-300 mt-4"
          >
            Test confettis
          </button>*/}
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
              Your new Hive account is now live on the blockchain{mockAccountCreation ? ' (mocked)' : ''}.
            </p>
          </div>
        )}
      </main>

      {/* Warning Modal 
      <dialog ref={modalRef} className="p-6 rounded-lg shadow-lg bg-white w-full max-w-md">
        <p className="text-lg font-bold mb-4">WARNING: Have you backed-up your seed phrase and Master password?</p>
        <p className="mb-6">Please make sure you've stored them somewhere safe or you'll lose access to your account!</p>
        <div className="flex justify-end space-x-2">
          <button
            onClick={() => modalRef.current?.close()}
            className="bg-blue-500 text-white font-bold px-4 py-2 rounded"
            autoFocus // Makes this the default button
          >
            Oops, let me check again
          </button>
          <button
            onClick={() => {
              modalRef.current?.close();
              setHasBackedUp(true);
            }}
            className="bg-black text-white font-bold px-4 py-2 rounded"
          >
            I did, thank you
          </button>
        </div>
      </dialog>*/}
    </div>
  );
}