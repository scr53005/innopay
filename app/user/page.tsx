'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { toast, ToastContainer } from 'react-toastify'; // Kept import, but not using for validation; remove if unused
import 'react-toastify/dist/ReactToastify.css';
import { useDropzone } from 'react-dropzone'; // For image picker
import confetti from 'canvas-confetti';
import Image from 'next/image';

// Check if in dev/test environment
const isDevOrTest = process.env.NEXT_PUBLIC_ENV !== 'production';
const innopayLogoUrl = "/innopay.svg";
const defaultAvatarUrl = "/images/Koala-BlueBg.png";

export type Metadata = { 
  name: string;
  about: string;
  location: string;
  website: string;
  avatarUri: string;
  backgroundUri: string;
}

// Temporary, for demonstration purposes
const mockCreateMetadata = (data: Metadata ) =>
  new Promise((resolve) =>
    setTimeout(() => {
      console.log('Mocking metadata creation with:', data);
      resolve({ success: true });
    }, 1500),
  );

// Helper function to check if any string field is non-empty
const isFormFilled = (metadata: Metadata) => {
  return (
    metadata.name.trim() !== '' ||
    metadata.about.trim() !== '' ||
    metadata.location.trim() !== '' ||
    metadata.website.trim() !== ''
  );
};

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

  // State for metadata form
  const [metadata, setMetadata] = useState({
    name: '',
    about: '',
    location: '',
    website: '',
    avatarUri: '',
    backgroundUri: '',
  });
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataSuccess, setMetadataSuccess] = useState(false);

  // State for storage strategy (default 'fast' for Bunny CDN)
  const [storageStrategy, setStorageStrategy] = useState<'fast' | 'pure'>('fast');

  // State for image uploads
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [backgroundPreviewUrl, setBackgroundPreviewUrl] = useState<string | null>(null);
  const [backgroundUploading, setBackgroundUploading] = useState(false);

  // New state for existing account from localStorage
  const [existingAccount, setExistingAccount] = useState<{ accountName: string; masterPassword: string; seed: string } | null>(null);
  const [showUpdateForm, setShowUpdateForm] = useState(false);

  const [isUsernameValid, setIsUsernameValid] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');
  const [isValidationSuccess, setIsValidationSuccess] = useState(false);

  const [mockAccountCreation, setMockAccountCreation] = useState(false);
  const [forcePaidCreation, setForcePaidCreation] = useState(false);

  // Refs for revoking object URLs
  const avatarPreviewRef = useCallback((url: string | null) => {
    if (avatarPreviewUrl && url !== avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl);
    }
  }, [avatarPreviewUrl]);
  const backgroundPreviewRef = useCallback((url: string | null) => {
    if (backgroundPreviewUrl && url !== backgroundPreviewUrl) {
      URL.revokeObjectURL(backgroundPreviewUrl);
    }
  }, [backgroundPreviewUrl]);

  // Load existing account from localStorage on mount
  useEffect(() => {
    console.log('Checking localStorage for existing account...');
    const acc = localStorage.getItem('innopayAccountName');
    const pass = localStorage.getItem('innopayMasterPassword');
    const seed = localStorage.getItem('innopaySeed');
    if (acc && pass && seed) {
      setExistingAccount({ accountName: acc, masterPassword: pass, seed });
      // Set results state for rendering welcome message
      setResults({ accountName: acc, masterPassword: pass, seed });

      // Fetch metadata for existing account
      const fetchMetadata = async () => {
        try {
          const response = await fetch('/api/fetch-hive-metadata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountName: acc }),
          });
          if (response.ok) {
            const data = await response.json();
            setMetadata(data.metadata || metadata); // Use fetched data or default state
            if (data.metadata?.avatarUri) {
                setMetadataSuccess(true);
            }
          }
        } catch (e) {
          console.error("Failed to fetch existing account metadata:", e);
        }
      };
      fetchMetadata();      

      console.log('Existing account found in localStorage:', acc);
    } else {
      console.log('No existing account found in localStorage.');
    }
  }, []);

  // Cleanup object URLs on unmount or change
  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
      if (backgroundPreviewUrl) URL.revokeObjectURL(backgroundPreviewUrl);
    };
  }, [avatarPreviewUrl, backgroundPreviewUrl]);

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
  
  const handleEraseLocalStorage = () => {
    localStorage.removeItem('innopayAccountName');
    localStorage.removeItem('innopayMasterPassword');
    localStorage.removeItem('innopaySeed');
    setExistingAccount(null);
    setShowUpdateForm(false);
    toast.info('Local storage erased. The page will reload.');
    window.location.reload(); // Force reload to show creation form    
  };

  const handleCreateAccount = async () => {
     // Early return if existing account is found
    if (existingAccount) {
      return;
    }

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

      // Save to localStorage upon success
      localStorage.setItem('innopayAccountName', returnedAccountName);
      localStorage.setItem('innopayMasterPassword', masterPassword);
      localStorage.setItem('innopaySeed', seed);

      // Set existing account state for UI display
      setExistingAccount({ accountName: returnedAccountName, masterPassword, seed });

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

  // Image upload helper (abstraction for avatar/background)
  const uploadImage = async (file: File, type: 'avatar' | 'background') => {
    if (!file) return null;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('strategy', storageStrategy);

    try {
      const response = await fetch('/api/storage', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const { uri } = await response.json();
      return uri;
    } catch (err: any) {
      toast.error(`${type} upload failed: ${err.message}`);
      return null;
    }
  };

  const handleSkip = useCallback(async () => {
    if (metadataLoading) return;
    setMetadataLoading(true);
    toast.info('Skipping profile setup...');

    try {
      const response = await fetch('/api/storage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountName: results.accountName,
          storageStrategy: storageStrategy,
        }),
      });

      const result = await response.json();
      if (response.ok) {
        setMetadata((prev) => ({
          ...prev,
          avatarUri: result.updatedAvatarUrl || defaultAvatarUrl
        }));
        setMetadataSuccess(true);
        setShowUpdateForm(false);
        toast.success("Profile skipped successfully!");
      } else {
        toast.error(`Error skipping profile: ${result.error}`);
      }
    } catch (error: any) {
      console.error('Failed to skip profile:', error);
      toast.error('Failed to connect to the server.');
    } finally {
      setMetadataLoading(false);
    }
  }, [results, storageStrategy, metadataLoading]);
  
  const handleMetadataSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (metadataLoading) return;

    if (!isFormFilled(metadata)) {
      handleSkip();
      return;
    }

    setMetadataLoading(true);

    try {
      // Upload avatar if selected
      const avatarUri = avatarFile ? await uploadImage(avatarFile, 'avatar') : metadata.avatarUri;
      if (!avatarUri && avatarFile) {
        throw new Error('Avatar upload required');
      }

      // Upload background if selected
      const backgroundUri = backgroundFile ? await uploadImage(backgroundFile, 'background') : metadata.backgroundUri;
      if (!backgroundUri && backgroundFile) {
        throw new Error('Background upload required');
      }

      // Build full metadata object
      const fullMetadata = {
        name: metadata.name.trim(),
        about: metadata.about.trim(),
        location: metadata.location.trim(),
        website: metadata.website.trim(),
        avatarUri: avatarUri || 'https://cdn.innopay.lu/Koala-BlueBg.png', // Default avatar if none
        backgroundUri: backgroundUri || '',
      };

      // Call Hive update API
      const response = await fetch('/api/update-hive-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountName: results.accountName,
          masterKey: results.masterPassword,
          metadata: fullMetadata,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update Hive account');
      }

      const updateResult = await response.json();
      setMetadata((prev) => ({
        ...prev,
        avatarUri,
        backgroundUri,
      }));
      setMetadataSuccess(true);
      setShowUpdateForm(false);
      toast.success("Profile updated successfully!");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to update profile.");
    } finally {
      setMetadataLoading(false);
    }
  }, [metadataLoading, metadata, avatarFile, backgroundFile, handleSkip, results, storageStrategy]);

  // Dropzone for avatar
  const onDropAvatar = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setAvatarFile(file);
      const previewUrl = URL.createObjectURL(file);
      setAvatarPreviewUrl(previewUrl);
    }
  }, []);

  const { getRootProps: getAvatarRootProps, getInputProps: getAvatarInputProps, isDragActive: isAvatarDragActive } = useDropzone({
    onDrop: onDropAvatar,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.gif'] },
    maxFiles: 1,
  });

  // Dropzone for background
  const onDropBackground = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setBackgroundFile(file);
      const previewUrl = URL.createObjectURL(file);
      setBackgroundPreviewUrl(previewUrl);
    }
  }, []);

  const { getRootProps: getBackgroundRootProps, getInputProps: getBackgroundInputProps, isDragActive: isBackgroundDragActive } = useDropzone({
    onDrop: onDropBackground,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.gif'] },
    maxFiles: 1,
  });

  const renderAccountCreationForm = () => (
    <>
      <div className="flex flex-col items-center space-y-8 p-4 sm:p-6 lg:p-8 bg-white rounded-xl shadow-lg w-4/5 max-w-md mb-6 mx-auto">
        <div className="relative w-[80%] max-w-[300px] h-auto aspect-video">
          <Image
            src={innopayLogoUrl}
            alt="Innopay Logo"
            fill
            className="object-contain rounded-lg"
          />
        </div>
      </div>
      <h1 className="text-3xl sm:text-4xl font-bold mb-2 text-center w-4/5">Create Your Innopay Account</h1>
      <p className="mt-2 text-lg sm:text-xl mb-4 text-center px-4 sm:px-0">
        Enter a desired username to create your new Innopay account on the Hive blockchain.
      </p>  <div className="w-full max-w-md relative px-4 sm:px-0">
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
      className={`w-4/5 p-4 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 transition-colors duration-300
        ${accountName.length > 0 ? (isUsernameValid ? 'bg-green-200/50' : 'bg-red-200/50') : ''}`}
    />
    {/* Dev/Test Controls: Checkboxes and Erase Button */}
    {isDevOrTest && (
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
    )}

    <button
      onClick={handleCreateAccount}
      disabled={loading || !isValidationSuccess}
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
</>  
);

  const renderExistingAccountView = () => (
    <>
      <header className="fixed top-4 right-4 z-10 flex items-center space-x-2">
          <button onClick={() => setShowUpdateForm(!showUpdateForm)}>
            <img
              src={metadata.avatarUri || defaultAvatarUrl}
              alt="User Avatar"
              className="w-10 h-10 rounded-full border-2 border-white shadow-md"
            />
          </button>
      </header>
      <div className="flex flex-col items-center justify-center min-h-screen py-2">
        <main className="flex flex-col items-center justify-center w-full flex-1 text-center">
          <div className="flex flex-col items-center space-y-8 p-4 sm:p-6 lg:p-8 bg-white rounded-xl shadow-lg w-full max-w-xl mb-6">
            <div className="relative w-4/5 h-auto aspect-video mb-6">
              <Image
                src={innopayLogoUrl}
                alt="Innopay Logo"
                fill
                className="object-contain"
              />
            </div>
            {!showUpdateForm ? (
              <>
                <div className="mt-6 px-4 py-6 w-full bg-yellow-100 border border-yellow-400 text-blue-800 rounded-lg text-left">
                  <h2 className="text-xl font-bold mb-2">Account Reminder</h2>
                  <p className="mb-4 text-sm leading-snug break-words">
                    Your Innopay account is <span className="font-mono font-bold text-blue-900 break-all">{existingAccount?.accountName}</span> and your master password is <br/><span className="font-mono font-bold text-blue-900 break-all">{existingAccount?.masterPassword}</span>.
                  </p>
                  <p className="text-sm">
                    Please use these credentials to access your account.
                  </p>
                </div>
                <button
                  onClick={() => setShowUpdateForm(true)}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 px-6 rounded-lg transition duration-300"
                >
                  Update Profile
                </button>
              </>
            ) : (
              <div className="w-full">
                <h1 className="text-4xl font-bold mb-6">Welcome, {existingAccount?.accountName}!</h1>
                <p className="mt-3 text-xl mb-8">
                  Your account is live! Now, let's create your profile.
                </p>

                {/* Storage Strategy Selector (Dev/Test only) */}
                {isDevOrTest && (
                  <div className="w-full mb-6">
                    <label htmlFor="strategy" className="block text-sm font-medium text-gray-700 mb-2">
                      Storage Strategy
                    </label>
                    <select
                      id="strategy"
                      value={storageStrategy}
                      onChange={(e) => setStorageStrategy(e.target.value as 'fast' | 'pure')}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="fast">Fast (Bunny CDN)</option>
                      <option value="pure">Pure (IPFS/Storacha)</option>
                    </select>
                  </div>
                )}
                <form onSubmit={handleMetadataSubmit} className="space-y-6">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700">Full Name</label>
                    <input
                      type="text"
                      id="name"
                      value={metadata.name}
                      onChange={(e) => setMetadata({ ...metadata, name: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="avatar" className="block text-sm font-medium text-gray-700">Avatar (Drag & Drop or Click)</label>
                    <div
                      {...getAvatarRootProps()}
                      className={`mt-1 p-6 border-2 border-dashed rounded-md text-center cursor-pointer ${
                        isAvatarDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <input {...getAvatarInputProps()} />
                      {isAvatarDragActive ? (
                        <p className="text-sm text-blue-600">Drop the image here...</p>
                      ) : avatarFile ? (
                        <p className="text-sm text-green-600">Image selected: {avatarFile.name}</p>
                      ) : (
                        <p className="text-sm text-gray-500">Click or drag an image (JPG, PNG, GIF)</p>
                      )}
                    </div>
                    {avatarPreviewUrl && (
                      <div className="mt-2 w-24 h-24 relative rounded-full overflow-hidden border border-gray-300 mx-auto">
                        <Image src={avatarPreviewUrl} alt="Avatar Preview" fill objectFit="cover" />
                      </div>
                    )}
                  </div>
                  <div>
                    <label htmlFor="about" className="block text-sm font-medium text-gray-700">About (Bio)</label>
                    <textarea
                      id="about"
                      rows={4}
                      value={metadata.about}
                      onChange={(e) => setMetadata({ ...metadata, about: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    ></textarea>
                  </div>
                  <div>
                    <label htmlFor="website" className="block text-sm font-medium text-gray-700">Website</label>
                    <input
                      type="url"
                      id="website"
                      value={metadata.website}
                      onChange={(e) => setMetadata({ ...metadata, website: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="location" className="block text-sm font-medium text-gray-700">Location</label>
                    <input
                      type="text"
                      id="location"
                      value={metadata.location}
                      onChange={(e) => setMetadata({ ...metadata, location: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="background" className="block text-sm font-medium text-gray-700">Background (Drag & Drop or Click)</label>
                    <div
                      {...getBackgroundRootProps()}
                      className={`mt-1 p-6 border-2 border-dashed rounded-md text-center cursor-pointer ${
                        isBackgroundDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <input {...getBackgroundInputProps()} />
                      {isBackgroundDragActive ? (
                        <p className="text-sm text-blue-600">Drop the image here...</p>
                      ) : backgroundFile ? (
                        <p className="text-sm text-green-600">Image selected: {backgroundFile.name}</p>
                      ) : (
                        <p className="text-sm text-gray-500">Click or drag an image (JPG, PNG, GIF)</p>
                      )}
                    </div>
                    {backgroundPreviewUrl && (
                      <div className="mt-2 w-full h-24 relative border border-gray-300">
                        <Image src={backgroundPreviewUrl} alt="Background Preview" fill objectFit="cover" />
                      </div>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={metadataLoading}
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 px-6 rounded-lg transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {metadataLoading ? 'Saving Profile...' : isFormFilled(metadata) ? 'Submit' : 'Skip'}
                  </button>
                </form>
              </div>
            )}
            {isDevOrTest && (
              <button
                onClick={handleEraseLocalStorage}
                type="button"
                className="w-full text-xs text-red-600 hover:text-red-800 underline mt-4"
              >
                Erase local storage and create a new account
              </button>
            )}
          </div>
        </main>
      </div>
    </>
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2">
      {existingAccount ? renderExistingAccountView() : renderAccountCreationForm()}
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