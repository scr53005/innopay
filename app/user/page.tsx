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

  // State for suggested username (lazy user flow)
  const [suggestedUsername, setSuggestedUsername] = useState('');
  const [usingSuggestedUsername, setUsingSuggestedUsername] = useState(true);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [loadingSuggestedUsername, setLoadingSuggestedUsername] = useState(true);

  // State for active campaign
  const [activeCampaign, setActiveCampaign] = useState<{
    id: number;
    name: string;
    minAmount50: number;
    bonus50: number;
    remainingSlots50: number;
    minAmount100: number;
    bonus100: number;
    remainingSlots100: number;
  } | null>(null);
  const [loadingCampaign, setLoadingCampaign] = useState(true);

  // State for amount selection
  const [topupAmount, setTopupAmount] = useState(5); // Default 5€ (TEMP: reduced for testing)
  const [minimumAmount, setMinimumAmount] = useState(3); // TEMP: reduced from 30€ to 3€ for testing
  const [orderAmount, setOrderAmount] = useState<number | null>(null); // Amount from indiesmenu order
  const [discount, setDiscount] = useState<number | null>(null); // Discount from indiesmenu order
  const [orderMemo, setOrderMemo] = useState<string | null>(null); // Memo from indiesmenu order (table, order details)

  // State for draggable validation toast
  const [toastPosition, setToastPosition] = useState({ x: 0, y: -60 }); // Start closer to input
  const [isDraggingToast, setIsDraggingToast] = useState(false);
  const [toastDragOffset, setToastDragOffset] = useState({ x: 0, y: 0 });

  const [mockAccountCreation, setMockAccountCreation] = useState(false);
  const [forcePaidCreation, setForcePaidCreation] = useState(false);

  // Ref for debouncing HAF availability check
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Load existing account from localStorage on mount + check for order amount from URL
  useEffect(() => {
    // Check URL for order amount and discount (from indiesmenu)
    const params = new URLSearchParams(window.location.search);

    const orderParam = params.get('order_amount');
    if (orderParam) {
      const parsedOrder = parseFloat(orderParam);
      if (!isNaN(parsedOrder) && parsedOrder > 0) {
        setOrderAmount(parsedOrder);
        // Set minimum to max(3, orderAmount) - TEMP: reduced from 30€ for testing
        const calculatedMin = Math.max(3, parsedOrder);
        setMinimumAmount(calculatedMin);
        // Set initial topup to the minimum
        setTopupAmount(calculatedMin);
        console.log(`[ORDER] Detected order amount: ${parsedOrder}€, minimum set to: ${calculatedMin}€`);
      }
    }

    const discountParam = params.get('discount');
    if (discountParam) {
      const parsedDiscount = parseFloat(discountParam);
      if (!isNaN(parsedDiscount) && parsedDiscount > 0) {
        setDiscount(parsedDiscount);
        console.log(`[ORDER] Detected discount: ${parsedDiscount}€`);
      }
    }

    const memoParam = params.get('memo');
    if (memoParam) {
      setOrderMemo(memoParam);
      console.log(`[${new Date().toISOString()}] [ACCOUNT CREATION FRONTEND] Detected memo from URL:`, memoParam);
      console.log(`[${new Date().toISOString()}] [ACCOUNT CREATION FRONTEND] Memo length:`, memoParam.length);
    }

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

      // Fetch suggested username for lazy users (with sessionStorage cache)
      const fetchSuggestedUsername = async () => {
        // Try to load from sessionStorage first (instant render on refresh)
        const cached = sessionStorage.getItem('innopay_suggested_username');
        if (cached) {
          console.log('[SUGGESTED USERNAME] Using cached:', cached);
          setSuggestedUsername(cached);
          setAccountName(cached);
          setIsUsernameValid(true);
          setUsingSuggestedUsername(true);
          setLoadingSuggestedUsername(false);
        }

        // Always fetch fresh suggestion in background
        try {
          const response = await fetch('/api/suggest-username');
          if (response.ok) {
            const data = await response.json();
            console.log('[SUGGESTED USERNAME] Fetched:', data.suggestedUsername);

            // Cache for future page loads in this session
            sessionStorage.setItem('innopay_suggested_username', data.suggestedUsername);

            // Update if different from cache (or if no cache)
            if (!cached || cached !== data.suggestedUsername) {
              setSuggestedUsername(data.suggestedUsername);
              setAccountName(data.suggestedUsername);
              setIsUsernameValid(true);
              setUsingSuggestedUsername(true);
            }

            setLoadingSuggestedUsername(false);
          }
        } catch (error) {
          console.error('[SUGGESTED USERNAME] Error fetching:', error);
          setLoadingSuggestedUsername(false);
        }
      };
      fetchSuggestedUsername();

      // Fetch active campaign
      const fetchActiveCampaign = async () => {
        try {
          const response = await fetch('/api/campaigns/active');
          if (response.ok) {
            const data = await response.json();
            console.log('[CAMPAIGN] Fetched active campaign:', data.campaign);
            setActiveCampaign(data.campaign);
          }
        } catch (e) {
          console.error('Failed to fetch active campaign:', e);
        } finally {
          setLoadingCampaign(false);
        }
      };

      fetchActiveCampaign();
    }
  }, []);

  // Cleanup object URLs on unmount or change
  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
      if (backgroundPreviewUrl) URL.revokeObjectURL(backgroundPreviewUrl);
    };
  }, [avatarPreviewUrl, backgroundPreviewUrl]);

  // Send credentials to opener window (e.g., indiesmenu) after successful account creation
  useEffect(() => {
    if (success && results.accountName && results.masterPassword && window.opener && !window.opener.closed) {
      console.log('Sending wallet credentials to opener window...');

      // Determine target origin (production vs local testing)
      const targetOrigin = window.location.hostname === 'localhost'
        ? '*' // Allow any origin during local testing
        : 'https://indies.innopay.lu';

      // Send message to the opener (indiesmenu)
      window.opener.postMessage(
        {
          type: 'INNOPAY_WALLET_CREATED',
          username: results.accountName,
          activeKey: results.masterPassword, // For now, sending masterPassword as activeKey
        },
        targetOrigin
      );

      console.log(`Credentials sent for ${results.accountName} to ${targetOrigin}`);
    }
  }, [success, results]);

  const validateAndHandleInput = async (input: string) => {
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

    // If format is valid, show optimistic success and check HAF in background
    if (isValid && lowerCaseInput.length >= 3) {
      // Immediate optimistic feedback (format is valid)
      setValidationMessage("Looks good! Click the button to create your account.");
      setIsValidationSuccess(true);
      setIsUsernameValid(true);

      // Clear any existing timeout
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Background check via HAF database (debounced 400ms)
      debounceTimerRef.current = setTimeout(async () => {
        try {
          const startTime = Date.now();
          const response = await fetch(`/api/haf-accounts/check?accountName=${encodeURIComponent(lowerCaseInput)}`);
          const data = await response.json();
          const duration = Date.now() - startTime;

          console.warn(`[HAF CHECK] Response time: ${duration}ms`, data);

          // Only update if username is taken (silent success if available)
          if (!data.available) {
            setValidationMessage("Sorry, this username has already been taken, try another one.");
            setIsValidationSuccess(false);
            setIsUsernameValid(false);
          }
          // If available, keep the optimistic "Looks good!" message
        } catch (error) {
          console.error('[HAF CHECK] Error:', error);
          // Graceful fallback: keep optimistic state, post-hoc verification will catch it
          console.warn('[HAF CHECK] Falling back to post-hoc verification');
        }
      }, 300); // 300ms debounce delay
    } else if (message) {
      setValidationMessage(message);
      setIsValidationSuccess(false);
      setIsUsernameValid(false);
    } else {
      setValidationMessage('');
      setIsUsernameValid(false);
    }
  };
  
  // Toast drag handlers
  const handleToastMouseDown = (e: React.MouseEvent) => {
    setIsDraggingToast(true);
    setToastDragOffset({
      x: e.clientX - toastPosition.x,
      y: e.clientY - toastPosition.y,
    });
  };

  const handleToastTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setIsDraggingToast(true);
    setToastDragOffset({
      x: touch.clientX - toastPosition.x,
      y: touch.clientY - toastPosition.y,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingToast) {
        setToastPosition({
          x: e.clientX - toastDragOffset.x,
          y: e.clientY - toastDragOffset.y,
        });
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isDraggingToast && e.touches[0]) {
        const touch = e.touches[0];
        setToastPosition({
          x: touch.clientX - toastDragOffset.x,
          y: touch.clientY - toastDragOffset.y,
        });
      }
    };

    const handleMouseUp = () => setIsDraggingToast(false);
    const handleTouchEnd = () => setIsDraggingToast(false);

    if (isDraggingToast) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDraggingToast, toastDragOffset]);

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
    setLoading(true);
    setValidationMessage(''); // Clear validation message on submit

    //const formattedName = accountName.toLowerCase();

    try {
      console.log('[ACCOUNT CREATION] Starting Stripe checkout flow for:', accountName);
      console.log('[ACCOUNT CREATION] Topup amount:', topupAmount);

      // Silently enforce minimum amount (don't throw - just fix it)
      const finalAmount = Math.max(topupAmount, minimumAmount);
      if (finalAmount !== topupAmount) {
        console.log(`[ACCOUNT CREATION] Amount adjusted from ${topupAmount}€ to minimum ${finalAmount}€`);
      }

      // Prepare checkout request
      const checkoutBody: any = {
        accountName: accountName,
        amount: finalAmount,
      };

      // Add campaign info if available
      if (activeCampaign) {
        checkoutBody.campaign = activeCampaign;
      }

      // Add order info if coming from indiesmenu
      if (orderAmount && orderAmount > 0) {
        checkoutBody.orderAmountEuro = orderAmount;
        checkoutBody.orderMemo = orderMemo || `Table order - ${finalAmount}€`;
        console.log(`[${new Date().toISOString()}] [ACCOUNT CREATION FRONTEND] Including order info in checkout body:`, {
          orderAmountEuro: orderAmount,
          orderMemo: checkoutBody.orderMemo,
          memoLength: checkoutBody.orderMemo?.length
        });
        if (!orderMemo) {
          console.warn(`[${new Date().toISOString()}] [ACCOUNT CREATION FRONTEND] ⚠️ WARNING: No memo provided, using fallback`);
        }
      }

      console.log('[ACCOUNT CREATION] Creating checkout session:', checkoutBody);

      const response = await fetch('/api/checkout/account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(checkoutBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create checkout session.');
      }

      const data = await response.json();
      console.log('[ACCOUNT CREATION] Checkout session created:', data.sessionId);

      // Redirect to Stripe checkout
      window.location.href = data.url;

    } catch (err: any) {
      console.error('[ACCOUNT CREATION] Error:', err);
      setError(err.message || 'An unexpected error occurred.');
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

 /* flex flex-col items-center space-y-4 p-6 sm:p-8 bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-500 rounded-xl shadow-lg w-full max-w-md mb-6 mx-auto
 w-[80%] max-w-[300px] */ 
  const renderAccountCreationForm = () => (
    <>
      <div className="flex flex-col items-center mb-4 p-4 bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-500 rounded-lg shadow-lg w-9/10 text-center">
        <div className="relative w-[80%] h-auto aspect-video">
          <Image
            src={innopayLogoUrl}
            alt="Innopay Logo"
            fill
            className="object-contain"
            priority={true}
          />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-blue-900 text-center">
          Créez votre compte Innopay
        </h1>
      </div>

      {/* Loading state while fetching suggested username */}
      {loadingSuggestedUsername ? (
        <div className="mt-8 flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
          <p className="text-gray-600">Préparation de votre compte...</p>
        </div>
      ) : (
        <>
          {/* Show explanation only if user has interacted with input */}
          {hasUserInteracted && (
            <p className="mt-2 text-lg sm:text-xl mb-4 text-center px-4 sm:px-0">
              Entrez le nom d'utilisateur souhaité pour créer votre compte Innopay.
            </p>
          )}

          <div className="w-full max-w-md relative px-4 sm:px-0 mt-8">
        {/* Show validation message only if user has interacted - Draggable */}
        {hasUserInteracted && validationMessage && (
          <div
            className={`fixed p-3 rounded-lg shadow-lg text-center validation-callout z-[9999] cursor-move select-none transition-colors
              ${isValidationSuccess ? 'bg-green-100/90 text-green-800' : 'bg-red-100/90 text-red-800'}`}
            style={{
              left: `calc(50% + ${toastPosition.x}px)`,
              top: `calc(50% + ${toastPosition.y}px)`,
              transform: 'translate(-50%, -50%)',
              minWidth: '280px',
              maxWidth: '400px',
            }}
            onMouseDown={handleToastMouseDown}
            onTouchStart={handleToastTouchStart}
          >
            {validationMessage}
          </div>
        )}

        <input
          type="text"
          value={accountName}
          onChange={(e) => {
            setUsingSuggestedUsername(false);
            setHasUserInteracted(true);
            validateAndHandleInput(e.target.value);
          }}
          onFocus={() => {
            setHasUserInteracted(true);
            if (accountName.length > 0 && !usingSuggestedUsername) {
              validateAndHandleInput(accountName);
            }
          }}
          placeholder="Choisissez un nom d'utilisateur"
          className={`w-full p-4 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 transition-colors duration-300
            ${accountName.length > 0 ? (isUsernameValid ? 'bg-green-200/50' : 'bg-red-200/50') : ''}`}
        />
    {/* Checkbox for account creation confirmation */}
    <label className="flex items-start space-x-3 mb-4 cursor-pointer group">
      <input
        type="checkbox"
        checked={isUsernameValid && accountName.length > 0}
        disabled
        className="mt-1 h-5 w-5 text-blue-500 focus:ring-blue-500 border-gray-300 rounded disabled:opacity-100"
      />
      <span className="text-base text-gray-800 select-none">
        {usingSuggestedUsername && !hasUserInteracted
          ? 'Créer un compte Innopay avec le nom suggéré'
          : 'Créer un compte Innopay'}
      </span>
    </label>

    {/* Discount Savings Display (from Indies order) */}
    {discount && discount > 0 && (
      <div className="mb-4 p-4 bg-gradient-to-r from-green-50 to-green-100 border-2 border-green-500 rounded-lg text-center">
        <p className="text-2xl font-bold text-green-700 flex items-center justify-center gap-2">
          <span>🎉</span>
          <span>Vous économisez {discount.toFixed(2)}€!</span>
          <span>🎉</span>
        </p>
        <p className="text-sm text-green-600 mt-1">
          En créant un compte Innopay, vous bénéficiez déjà d'une réduction sur votre commande
        </p>
      </div>
    )}

    {/* Campaign Bonus Display with Quick-Select Buttons */}
    {activeCampaign && (activeCampaign.remainingSlots50 > 0 || activeCampaign.remainingSlots100 > 0) && (
      <div className="mb-4 p-4 bg-gradient-to-r from-yellow-50 to-yellow-100 border-2 border-yellow-400 rounded-lg">
        <h3 className="text-lg font-bold text-yellow-800 mb-3 flex items-center gap-2">
          <span>🎁</span>
          <span>{activeCampaign.name}</span>
        </h3>
        <div className="space-y-3">
          {activeCampaign.remainingSlots50 > 0 && (
            <div className="flex items-center gap-3 bg-white/50 p-3 rounded-lg">
              <div className="flex-1 text-sm text-yellow-900">
                <p className="font-semibold">
                  Payez <span className="text-base font-bold">{activeCampaign.minAmount50}€</span> ou plus
                  → Recevez <span className="text-base font-bold text-green-700">{activeCampaign.bonus50}€ de bonus</span>
                </p>
                <span className="text-xs text-yellow-700">
                  ({activeCampaign.remainingSlots50} places restantes)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setTopupAmount(activeCampaign.minAmount50 + (activeCampaign.minAmount100 -  activeCampaign.minAmount50)/2)}
                className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold rounded-lg transition-colors text-sm whitespace-nowrap"
              >
                Choisir {activeCampaign.minAmount50 + (activeCampaign.minAmount100 -  activeCampaign.minAmount50)/2}€
              </button>
            </div>
          )}
          {activeCampaign.remainingSlots100 > 0 && (
            <div className="flex items-center gap-3 bg-white/50 p-3 rounded-lg">
              <div className="flex-1 text-sm text-yellow-900">
                <p className="font-semibold">
                  Payez <span className="text-base font-bold">{activeCampaign.minAmount100}€</span> ou plus
                  → Recevez <span className="text-base font-bold text-green-700">{activeCampaign.bonus100}€ de bonus</span>
                </p>
                <span className="text-xs text-yellow-700">
                  ({activeCampaign.remainingSlots100} places restantes)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setTopupAmount(activeCampaign.minAmount100 * 2)}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors text-sm whitespace-nowrap"
              >
                Choisir {activeCampaign.minAmount100 * 2}€
              </button>
            </div>
          )}
        </div>
      </div>
    )}

    {/* Amount Input Field */}
    <div className="mb-4">
      <label htmlFor="topupAmount" className="block text-sm font-semibold text-gray-700 mb-2">
        Montant de rechargement (EUR)
        {orderAmount && (
          <span className="ml-2 text-xs font-normal text-gray-500">
            (Commande: {orderAmount}€, Minimum: {minimumAmount}€)
          </span>
        )}
      </label>
      <input
        id="topupAmount"
        type="number"
        min={minimumAmount}
        step="0.01"
        value={topupAmount}
        onChange={(e) => {
          // Allow free entry - just update the value
          const value = e.target.value === '' ? minimumAmount : parseFloat(e.target.value);
          if (!isNaN(value)) {
            setTopupAmount(value);
          }
        }}
        onBlur={(e) => {
          // Validate when user leaves the field
          const value = parseFloat(e.target.value);
          if (isNaN(value) || value < minimumAmount) {
            setTopupAmount(minimumAmount);
          }
        }}
        className="w-full p-4 border-2 border-blue-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg font-semibold"
      />
      <p className="mt-2 text-sm text-black font-medium">
        Vous pouvez entrer n'importe quel montant ≥ {minimumAmount}€. Choisissez un palier de campagne ci-dessus pour une sélection rapide.
      </p>
    </div>

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
      disabled={loading || !isUsernameValid}
      className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 px-6 rounded-lg transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading
        ? 'Redirection vers le paiement...'
        : `Procéder au paiement (${topupAmount}€)`}
    </button>
  </div>

  {error && (
    <div className="mt-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg max-w-md">
      <p className="font-bold">Error:</p>
      <p>{error}</p>
    </div>
  )}
        </>
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