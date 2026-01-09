'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { toast, ToastContainer } from 'react-toastify'; // Kept import, but not using for validation; remove if unused
import 'react-toastify/dist/ReactToastify.css';
import { useDropzone } from 'react-dropzone'; // For image picker
import confetti from 'canvas-confetti';
import Image from 'next/image';
import MiniWallet, { WalletReopenButton } from '@/app/components/MiniWallet';

// Check if in dev/test environment
const isDevOrTest = process.env.NEXT_PUBLIC_ENV !== 'production';
const innopayLogoUrl = "/innopay.svg";
const defaultAvatarUrl = "/images/Koala-BlueBg.png";

// Spoke data type (fetched from database)
type SpokeData = {
  id: string;
  name: string;
  type: string;
  domain_prod: string;
  port_dev: number;
  path: string;
  attribute_name_1: string | null;
  attribute_default_1: string | null;
  attribute_storage_key_1: string | null;
  active: boolean;
  ready: boolean;
};

// Helper function to get spoke base URL based on environment (hub-and-spoke architecture)
// Uses database-driven spoke data instead of hardcoded values
const getSpokeBaseUrl = (spokeData: SpokeData): string => {
  if (typeof window === 'undefined') {
    // SSR fallback
    return `http://localhost:${spokeData.port_dev}`;
  }

  const hostname = window.location.hostname;

  // Production environment
  if (hostname === 'wallet.innopay.lu') {
    return `https://${spokeData.domain_prod}`;
  }

  // Mobile testing (Android/iOS on local network)
  // Use same IP as hub but spoke's dev port from database
  if (hostname.startsWith('192.168.')) {
    return `http://${hostname}:${spokeData.port_dev}`;
  }

  // Desktop/localhost testing
  return `http://localhost:${spokeData.port_dev}`;
};

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

// Language type
type Language = 'fr' | 'en' | 'de' | 'lb';

// Translations for success messages
const translations = {
  fr: {
    accountIs: "Votre compte Innopay est:",
    registeredWith: "et vous vous êtes enregistré avec l'email:",
    callToAction: "Améliorez votre profil pour gagner des réductions ou explorez les boutiques et restaurants Innopay à proximité.",
    beautifyProfile: "Améliorer mon profil",
    exploreShops: "Explorer les boutiques Innopay",
    returnToMerchant: "Revenir au site marchand",
    accountFoundTitle: "Compte trouvé",
    accountFoundMessage: "Vous avez déjà un compte Innopay",
    currentBalance: "Solde actuel:",
    okButton: "OK",
    insufficientBalanceTitle: "Rechargement nécessaire",
    insufficientBalanceMessage: "Le solde de votre compte n'est pas suffisant pour la commande en cours, un rechargement est nécessaire.",
    orderAmount: "Montant de la commande:",
    topupRequired: "Rechargement requis:",
    continueButton: "Continuer"
  },
  en: {
    accountIs: "Your Innopay account is:",
    registeredWith: "and you registered with email:",
    callToAction: "Beautify your profile to earn discounts or explore the nearby Innopay shops and restaurants.",
    beautifyProfile: "Beautify profile",
    exploreShops: "Explore Innopay shops",
    returnToMerchant: "Return to merchant site",
    accountFoundTitle: "Account Found",
    accountFoundMessage: "You already have an Innopay account",
    currentBalance: "Current balance:",
    okButton: "OK",
    insufficientBalanceTitle: "Top-up Required",
    insufficientBalanceMessage: "Your account balance is not sufficient for the current order, a top-up is required.",
    orderAmount: "Order amount:",
    topupRequired: "Top-up required:",
    continueButton: "Continue"
  },
  de: {
    accountIs: "Ihr Innopay-Konto ist:",
    registeredWith: "und Sie haben sich mit der E-Mail registriert:",
    callToAction: "Verschönern Sie Ihr Profil, um Rabatte zu verdienen oder erkunden Sie die nahegelegenen Innopay-Geschäfte und Restaurants.",
    beautifyProfile: "Profil verschönern",
    exploreShops: "Innopay-Geschäfte erkunden",
    returnToMerchant: "Zurück zur Händlerseite",
    accountFoundTitle: "Konto gefunden",
    accountFoundMessage: "Sie haben bereits ein Innopay-Konto",
    currentBalance: "Aktueller Saldo:",
    okButton: "OK",
    insufficientBalanceTitle: "Aufladung erforderlich",
    insufficientBalanceMessage: "Ihr Kontoguthaben reicht für die aktuelle Bestellung nicht aus, eine Aufladung ist erforderlich.",
    orderAmount: "Bestellbetrag:",
    topupRequired: "Aufladung erforderlich:",
    continueButton: "Fortsetzen"
  },
  lb: {
    accountIs: "Äert Innopay Konto ass:",
    registeredWith: "an Dir hutt Iech mat der E-Mail registréiert:",
    callToAction: "Verschéinert Äert Profil fir Rabatter ze verdéngen oder entdeckt déi no Innopay Geschäfter a Restauranten.",
    beautifyProfile: "Profil verschéineren",
    exploreShops: "Innopay Geschäfter entdecken",
    returnToMerchant: "Zréck op d'Händler-Säit",
    accountFoundTitle: "Konto fonnt",
    accountFoundMessage: "Dir hutt schonn en Innopay Konto",
    currentBalance: "Aktuellen Solde:",
    okButton: "OK",
    insufficientBalanceTitle: "Oplueden néideg",
    insufficientBalanceMessage: "Äert Kontoguthaben ass net genuch fir déi aktuell Bestellung, en Oplueden ass néideg.",
    orderAmount: "Bestellmontant:",
    topupRequired: "Oplueden néideg:",
    continueButton: "Weidermachen"
  }
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

  // Language state
  const [language, setLanguage] = useState<Language>('fr');

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
  const [existingAccount, setExistingAccount] = useState<{ accountName: string; masterPassword: string; seed: string; email?: string } | null>(null);
  const [showUpdateForm, setShowUpdateForm] = useState(false);

  // State for account balance (for MiniWallet)
  const [accountBalance, setAccountBalance] = useState<number | null>(null);
  const [showWalletBalance, setShowWalletBalance] = useState(true); // Show wallet by default when account exists

  // State for Flow 5→7 modals
  const [showAccountFoundModal, setShowAccountFoundModal] = useState(false);
  const [showInsufficientBalanceModal, setShowInsufficientBalanceModal] = useState(false);
  const [modalAccountInfo, setModalAccountInfo] = useState<{ accountName: string; balance: number; email?: string } | null>(null);
  const [modalTopupInfo, setModalTopupInfo] = useState<{ currentBalance: number; orderAmount: number; topupAmount: number } | null>(null);
  const [proceedWithFlow, setProceedWithFlow] = useState<(() => void) | null>(null);

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

  // State for user choice (Import vs Create)
  const [userChoice, setUserChoice] = useState<'import' | 'create' | null>(null);

  // State for import account functionality
  const [importEmail, setImportEmail] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importAttempts, setImportAttempts] = useState(5);
  const [importStep, setImportStep] = useState<'email' | 'code' | 'select'>('email');
  const [verificationCode, setVerificationCode] = useState('');
  const [multipleAccounts, setMultipleAccounts] = useState<Array<{
    accountName: string;
    creationDate: string;
    euroBalance: number;
  }>>([]);

  // State for amount selection
  const [topupAmount, setTopupAmount] = useState(5); // Default 5€ (TEMP: reduced for testing)
  const [minimumAmount, setMinimumAmount] = useState(3); // TEMP: reduced from 30€ to 3€ for testing
  const [orderAmount, setOrderAmount] = useState<number | null>(null); // Amount from indiesmenu order
  const [discount, setDiscount] = useState<number | null>(null); // Discount from indiesmenu order
  const [orderMemo, setOrderMemo] = useState<string | null>(null); // Memo from indiesmenu order (table, order details)
  const [restaurant, setRestaurant] = useState<string>('indies'); // Restaurant identifier (default: indies)
  const [restaurantAccount, setRestaurantAccount] = useState<string>('indies.cafe'); // Restaurant Hive account (default: indies.cafe)
  const [spokeData, setSpokeData] = useState<SpokeData | null>(null); // Spoke data from database

  // State for draggable validation toast
  const [toastPosition, setToastPosition] = useState({ x: 0, y: -60 }); // Start closer to input
  const [isDraggingToast, setIsDraggingToast] = useState(false);
  const [toastDragOffset, setToastDragOffset] = useState({ x: 0, y: 0 });

  const [mockAccountCreation, setMockAccountCreation] = useState(false);
  const [forcePaidCreation, setForcePaidCreation] = useState(false);

  // Ref for debouncing HAF availability check
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Ref to prevent double-fetching in React StrictMode (dev only)
  const hasFetchedUsername = useRef(false);
  const hasFetchedCampaign = useRef(false);
  const hasExecutedFlow5 = useRef(false); // Prevent duplicate Flow 5 execution

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

  // ═══════════════════════════════════════════════════════════════════════════════
  // FLOW 5 EXISTING ACCOUNT HANDLER
  // When user arrives for account creation but already has an account
  // ═══════════════════════════════════════════════════════════════════════════════
  const handleExistingAccountFlow5 = async (
    accountName: string,
    masterPassword: string,
    orderAmount: number,
    table: string | null,
    orderMemo: string | null,
    restaurant: string,
    restaurantAccount: string,
    returnUrl: string | null
  ) => {
    // Prevent duplicate execution (React StrictMode, re-renders, etc.)
    if (hasExecutedFlow5.current) {
      console.log('[FLOW 5 EXISTING ACCOUNT] ⚠️ Already executed, skipping duplicate call');
      return;
    }
    hasExecutedFlow5.current = true;
    console.log('[FLOW 5 EXISTING ACCOUNT] 🔒 Execution lock acquired');

    try {
      console.log('[FLOW 5 EXISTING ACCOUNT] Unified approach - checking balance');
      console.log('[FLOW 5 EXISTING ACCOUNT] Return URL:', returnUrl);

      // Step 1: Fetch robust EURO balance
      const balanceResponse = await fetch(`/api/balance/euro?account=${accountName}`);
      if (!balanceResponse.ok) {
        throw new Error('Failed to fetch balance');
      }
      const balanceData = await balanceResponse.json();
      const euroBalance = balanceData.balance;

      console.log('[FLOW 5 EXISTING ACCOUNT] Balance:', euroBalance, 'Order:', orderAmount);

      // Step 1.5: Show account found modal with balance
      const email = localStorage.getItem('innopay_email');
      setModalAccountInfo({ accountName, balance: euroBalance, email: email || undefined });
      setAccountBalance(euroBalance); // Set balance for display
      setShowAccountFoundModal(true);

      // Create continuation function based on balance
      const continueFlow = async () => {
        setShowAccountFoundModal(false); // Close account found modal

        // Step 2: Branch based on balance
        if (euroBalance >= orderAmount) {
          // BRANCH A: Sufficient balance - Execute payment directly in innopay
          console.log('[FLOW 5 BRANCH A] Sufficient balance - executing payment in innopay');

          console.log('[FLOW 5 BRANCH A] Calling execute-order-payment API');

        // Call the execute-order-payment API
        const paymentResponse = await fetch('/api/execute-order-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountName,
            orderAmount,
            orderMemo: orderMemo || '',  // Empty string will be caught by API validation
            restaurantAccount,
            table: table || undefined,
            returnUrl: returnUrl || undefined  // Pass return URL to preserve environment
          })
        });

        if (!paymentResponse.ok) {
          const errorData = await paymentResponse.json();
          throw new Error(errorData.message || 'Payment execution failed');
        }

        const paymentData = await paymentResponse.json();
        console.log('[FLOW 5 BRANCH A] Payment successful:', paymentData);
        console.log('[FLOW 5 BRANCH A] Transaction IDs:', {
          customerEuroTx: paymentData.customerEuroTxId,
          restaurantHbdTx: paymentData.restaurantHbdTxId,
          restaurantEuroTx: paymentData.restaurantEuroTxId
        });

          // Update balance optimistically (show updated balance in MiniWallet before redirect)
          const newBalance = euroBalance - orderAmount;
          localStorage.setItem('innopay_lastBalance', newBalance.toFixed(2));
          localStorage.setItem('innopay_lastBalance_timestamp', Date.now().toString());
          setAccountBalance(newBalance);
          console.log('[FLOW 5 BRANCH A] Updated balance optimistically:', euroBalance, '→', newBalance);

          // Redirect to restaurant with success
          window.location.href = paymentData.redirectUrl;

        } else {
          // BRANCH B: Insufficient balance - Show modal then redirect to Stripe topup
          console.log('[FLOW 5 BRANCH B] Insufficient balance - need topup');

          const deficit = orderAmount - euroBalance;

          // Round deficit UP to nearest euro first
          const deficitRoundedUp = Math.ceil(deficit);

          // Then round UP to nearest 5€ increment
          const topupAmount = Math.max(
            Math.ceil(deficitRoundedUp / 5) * 5, // Round up to nearest 5€
            15 // Minimum 15€
          );

          console.log('[FLOW 5 BRANCH B] Topup calculation:', {
            deficitRaw: deficit,
            deficitRoundedUp: deficitRoundedUp,
            topupAmount: topupAmount
          });

          // Show insufficient balance modal
          setModalTopupInfo({ currentBalance: euroBalance, orderAmount, topupAmount });
          setShowInsufficientBalanceModal(true);

          // Create topup continuation function
          const proceedToTopup = async () => {
            setShowInsufficientBalanceModal(false);

        // Redirect to Stripe checkout with order context in metadata
        const checkoutResponse = await fetch('/api/checkout/account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: topupAmount, // Already rounded to nearest 5€
            accountName,
            email: localStorage.getItem('innopay_email') || undefined,
            redirectParams: {
              table,
              orderAmount: orderAmount.toString(),
              orderMemo
            },
            hasLocalStorageAccount: true,
            accountBalance: euroBalance,
            restaurantAccount: restaurantAccount // Add for hub-and-spokes multi-restaurant
          })
        });

        if (!checkoutResponse.ok) {
          throw new Error('Failed to create Stripe checkout');
        }

        const checkoutData = await checkoutResponse.json();

            if (checkoutData.url) {
              console.log('[FLOW 5 BRANCH B] Redirecting to Stripe:', checkoutData.url);
              window.location.href = checkoutData.url;
            } else {
              throw new Error('No checkout URL received');
            }
          };

          // Store topup function for modal to call
          setProceedWithFlow(() => proceedToTopup);
        }
      };

      // Store continue function for account found modal to call
      setProceedWithFlow(() => continueFlow);

    } catch (error: any) {
      console.error('[FLOW 5 EXISTING ACCOUNT] Error:', error);
      alert(`Erreur: ${error.message}`);
      hasExecutedFlow5.current = false; // Reset lock on error
    }
  };

  // 🔧 DEBUG: Load Eruda for mobile debugging (COMMENTED OUT FOR PRODUCTION)
  // Uncomment for mobile debugging only
  // useEffect(() => {
  //   const script = document.createElement('script');
  //   script.src = 'https://cdn.jsdelivr.net/npm/eruda';
  //   script.onload = () => {
  //     if ((window as any).eruda) {
  //       (window as any).eruda.init();
  //       console.log('🔧 Eruda mobile debugger loaded - tap floating button to open console');
  //     }
  //   };
  //   document.body.appendChild(script);

  //   return () => {
  //     // Cleanup on unmount
  //     if (script.parentNode) {
  //       script.parentNode.removeChild(script);
  //     }
  //   };
  // }, []);

  // Load existing account from localStorage on mount + check for order amount from URL
  useEffect(() => {
    // Load import attempts from localStorage
    const storedAttempts = localStorage.getItem('innopay_import_attempts');
    if (storedAttempts) {
      setImportAttempts(parseInt(storedAttempts, 10));
    }

    // Check URL for account_created flag (from /user/success after new_account flow)
    const params = new URLSearchParams(window.location.search);
    const accountCreated = params.get('account_created');

    if (accountCreated === 'true') {
      console.log('[USER PAGE] ✨ New account creation detected! Showing celebration...');

      // Trigger confetti celebration
      triggerConfetti();

      // Get account details from localStorage (already stored by success page)
      const accountName = localStorage.getItem('innopay_accountName');
      const masterPassword = localStorage.getItem('innopay_masterPassword');
      const balance = localStorage.getItem('innopay_lastBalance');
      const email = localStorage.getItem('innopay_email');

      if (accountName && masterPassword) {
        setSuccess(true);
        setResults({
          accountName,
          masterPassword,
          seed: '', // Seed not needed for display
        });
        setExistingAccount({
          accountName,
          masterPassword,
          seed: '', // Seed not needed
          email: email || undefined,
        });

        // Set balance from localStorage (optimistic balance from credential session)
        if (balance) {
          const balanceNum = parseFloat(balance);
          if (!isNaN(balanceNum)) {
            setAccountBalance(balanceNum);
            console.log('[USER PAGE] Account created:', accountName, 'Balance:', balanceNum, '€ (from localStorage)');
          }
        }
      }

      // Clean up URL
      window.history.replaceState({}, '', '/user');
    }

    const orderParam = params.get('order_amount');
    if (orderParam) {
      const parsedOrder = parseFloat(orderParam);
      if (!isNaN(parsedOrder) && parsedOrder >= 0) { // Changed from > 0 to >= 0 to support create_account_only (order=0)
        setOrderAmount(parsedOrder);

        if (parsedOrder > 0) {
          // create_account_and_pay: minimum must cover both account creation AND order
          // Round UP to nearest 5€ increment with minimum 15€
          const baseAmount = Math.max(3, parsedOrder);
          const calculatedMin = Math.max(
            Math.ceil(baseAmount / 5) * 5,
            15
          );
          setMinimumAmount(calculatedMin);
          setTopupAmount(calculatedMin);
          console.log(`[ORDER] create_account_and_pay flow: order=${parsedOrder}€, rounded to: ${calculatedMin}€`);
        } else {
          // create_account_only: minimum is just the account creation minimum (3€)
          // Keep default minimumAmount (3€) - no need to adjust
          console.log(`[ORDER] create_account_only flow: order_amount=0, minimum remains at account creation minimum (3€)`);
        }
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

    // Read restaurant identification parameters
    const restaurantParam = params.get('restaurant');
    if (restaurantParam) {
      setRestaurant(restaurantParam);
      console.log(`[RESTAURANT] Detected restaurant: ${restaurantParam}`);

      // Fetch spoke data from database for environment-aware URL resolution
      fetch(`/api/spokes/${restaurantParam}`)
        .then(res => res.json())
        .then(data => {
          if (data.spoke) {
            setSpokeData(data.spoke);
            console.log(`[RESTAURANT] Spoke data loaded:`, data.spoke);
          } else {
            console.warn(`[RESTAURANT] Spoke not found in database: ${restaurantParam}`);
          }
        })
        .catch(err => {
          console.error(`[RESTAURANT] Failed to fetch spoke data:`, err);
        });
    }

    const restaurantAccountParam = params.get('restaurant_account');
    if (restaurantAccountParam) {
      setRestaurantAccount(restaurantAccountParam);
      console.log(`[RESTAURANT] Detected restaurant account: ${restaurantAccountParam}`);
    }

    // FIRST PRIORITY: Check localStorage for existing account
    console.log('[USER PAGE] Checking localStorage for existing account...');
    const acc = localStorage.getItem('innopay_accountName') || localStorage.getItem('innopayAccountName');
    const pass = localStorage.getItem('innopay_masterPassword') || localStorage.getItem('innopayMasterPassword');
    const seed = localStorage.getItem('innopay_seed') || localStorage.getItem('innopaySeed');

    if (acc && pass) {
      // Account exists! Show existing account view
      console.log('[USER PAGE] ✅ Existing account found in localStorage:', acc);

      // Check if this is Flow 5 (create_account_and_pay) with existing account
      const orderParam = params.get('order_amount');
      const tableParam = params.get('table');
      // Try both 'memo' (from indiesmenu) and 'order_memo' (legacy) for backward compatibility
      const memoParam = params.get('memo') || params.get('order_memo');

      if (orderParam && parseFloat(orderParam) > 0) {
        // Flow 5 with existing account - need to redirect back to indiesmenu with credentials
        console.log('[FLOW 5 EXISTING ACCOUNT] Detected Flow 5 with existing account');
        console.log('[FLOW 5 EXISTING ACCOUNT] Order:', orderParam, 'Table:', tableParam);

        // Handle Flow 5 existing account redirect
        // Get restaurant parameters from state (set earlier from URL params)
        const restaurantParam = params.get('restaurant') || 'indies';
        const restaurantAccountParam = params.get('restaurant_account') || 'indies.cafe';
        const returnUrlParam = params.get('return_url'); // Get return URL to preserve environment

        handleExistingAccountFlow5(acc, pass, parseFloat(orderParam), tableParam, memoParam, restaurantParam, restaurantAccountParam, returnUrlParam);
        return; // Exit early - redirect will happen
      }

      // Try to get email from localStorage (stored during account creation)
      const email = localStorage.getItem('innopay_email');

      setExistingAccount({ accountName: acc, masterPassword: pass, seed: seed || '', email: email || undefined });
      setResults({ accountName: acc, masterPassword: pass, seed: seed || '' });
      setSuccess(true); // Show success state (existing account view)

      // Check if this is a mock account (starts with "mockaccount")
      const isMockAccount = acc.startsWith('mockaccount');

      if (isMockAccount) {
        // For mock accounts, use cached balance from localStorage (don't fetch from blockchain)
        console.log('[USER PAGE] Mock account detected:', acc);
        const cachedBalance = localStorage.getItem('innopay_lastBalance');
        if (cachedBalance) {
          const balanceNum = parseFloat(cachedBalance);
          if (!isNaN(balanceNum)) {
            setAccountBalance(balanceNum);
            console.log('[USER PAGE] Using cached balance for mock account:', balanceNum, '€');
          } else {
            setAccountBalance(0);
          }
        } else {
          setAccountBalance(0);
        }
      } else {
        // For real accounts, fetch balance from Hive-Engine
        const fetchBalance = async () => {
          try {
            const response = await fetch('https://api.hive-engine.com/rpc/contracts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'find',
                params: {
                  contract: 'tokens',
                  table: 'balances',
                  query: { account: acc, symbol: 'EURO' },
                },
                id: 1,
              }),
            });

            if (response.ok) {
              const data = await response.json();
              if (data.result && data.result.length > 0) {
                const balance = parseFloat(data.result[0].balance);
                setAccountBalance(balance);
                console.log('[USER PAGE] Balance fetched from Hive-Engine:', balance, '€');

                // Save to localStorage for optimistic balance calculations
                localStorage.setItem('innopay_lastBalance', balance.toString());
              } else {
                setAccountBalance(0);
                localStorage.setItem('innopay_lastBalance', '0');
              }
            }
          } catch (e) {
            console.error("[USER PAGE] Failed to fetch balance:", e);
            setAccountBalance(0);
          }
        };
        fetchBalance();
      }

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
          console.error("[USER PAGE] Failed to fetch existing account metadata:", e);
        }
      };
      fetchMetadata();
    } else {
      // NO ACCOUNT EXISTS - prepare for account creation
      console.log('[USER PAGE] No existing account found. Preparing account creation form...');

      // Fetch suggested username for lazy users (with sessionStorage cache)
      const fetchSuggestedUsername = async () => {
        // Prevent double-fetch in React StrictMode (development only)
        if (hasFetchedUsername.current) {
          console.log('[SUGGESTED USERNAME] Skipping fetch (already initiated)');
          return;
        }
        hasFetchedUsername.current = true;

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
        // Prevent double-fetch in React StrictMode (development only)
        if (hasFetchedCampaign.current) {
          console.log('[CAMPAIGN] Skipping fetch (already initiated)');
          return;
        }
        hasFetchedCampaign.current = true;

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

      // Prepare checkout request with flow context
      const checkoutBody: any = {
        accountName: accountName,
        amount: finalAmount,
        hasLocalStorageAccount: false, // Always false on account creation page
        mockAccountCreation: mockAccountCreation, // Pass mock flag for dev/test
      };

      // Add campaign info if available
      if (activeCampaign) {
        checkoutBody.campaign = activeCampaign;
      }

      // Add redirect parameters if coming from restaurant (orderAmount exists, even if 0)
      if (orderAmount !== null && orderAmount !== undefined) {
        // Get table parameter from URL if present
        const params = new URLSearchParams(window.location.search);
        const table = params.get('table');

        checkoutBody.redirectParams = {
          table: table,
          orderAmount: orderAmount.toString(),
          orderMemo: orderMemo || '',  // Empty string will trigger error in checkout API if order amount > 0
        };

        // Also add as top-level for backward compatibility
        checkoutBody.orderAmountEuro = orderAmount;
        checkoutBody.orderMemo = orderMemo || '';  // Empty string will trigger error in checkout API if order amount > 0

        // Add restaurant account for hub-and-spokes multi-restaurant architecture
        if (restaurantAccount) {
          checkoutBody.restaurantAccount = restaurantAccount;
        }

        console.log(`[${new Date().toISOString()}] [ACCOUNT CREATION FRONTEND] Including flow context:`, {
          hasLocalStorageAccount: false,
          redirectParams: checkoutBody.redirectParams,
          orderAmountEuro: orderAmount,
          orderMemo: checkoutBody.orderMemo,
          memoLength: checkoutBody.orderMemo?.length,
          restaurantAccount: checkoutBody.restaurantAccount,
          flowType: orderAmount > 0 ? 'create_account_and_pay' : 'create_account_only'
        });

        if (orderAmount > 0 && !orderMemo) {
          console.warn(`[${new Date().toISOString()}] [ACCOUNT CREATION FRONTEND] ⚠️ WARNING: Order amount > 0 but no memo provided, using fallback`);
        }
      }

      console.log('[ACCOUNT CREATION] Creating checkout session with flow context:', checkoutBody);

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

  // Handle email submission (request verification code)
  const handleRequestCode = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const sanitizedEmail = importEmail.trim().toLowerCase();

    if (!emailRegex.test(sanitizedEmail)) {
      setImportError('Invalid email format / Format d\'email invalide');
      setTimeout(() => setImportError(''), 3000);
      return;
    }

    setImportLoading(true);
    setImportError('');

    try {
      console.log('[VERIFY] Requesting code for:', sanitizedEmail);

      const response = await fetch('/api/verify/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: sanitizedEmail, language: 'en' }) // TODO: Detect user language
      });

      const data = await response.json();
      console.log('[VERIFY] Request response:', data);

      if (data.found === true) {
        // Code sent! Move to code entry step
        setImportStep('code');
        setImportLoading(false);
      } else if (data.found === false) {
        // Email not found - decrement attempts
        const newAttempts = importAttempts - 1;
        setImportAttempts(newAttempts);
        localStorage.setItem('innopay_import_attempts', newAttempts.toString());

        if (newAttempts <= 0) {
          setImportError('Rien dans la base de données, désolé!');

          // After showing error for 3 seconds, hide import form and show create account
          setTimeout(() => {
            setImportError('');
            setImportLoading(false);
            setUserChoice('create'); // Switch to create account view
          }, 3000);
        } else {
          setImportError(`Vous avez peut-être utilisé une adresse mail différente (${newAttempts} tentatives restantes)`);

          setTimeout(() => {
            setImportError('');
            setImportLoading(false);
          }, 3000);
        }
      } else if (data.error) {
        setImportError(data.error);
        setTimeout(() => {
          setImportError('');
          setImportLoading(false);
        }, 3000);
      }
    } catch (error) {
      console.error('[VERIFY] Network error:', error);
      setImportError('Erreur de connexion au serveur');
      setTimeout(() => {
        setImportError('');
        setImportLoading(false);
      }, 3000);
    }
  };

  // Handle verification code submission
  const handleVerifyCode = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setImportError('Please enter a 6-digit code / Entrez un code à 6 chiffres');
      setTimeout(() => setImportError(''), 3000);
      return;
    }

    setImportLoading(true);
    setImportError('');

    try {
      console.log('[VERIFY] Checking code:', verificationCode);

      const response = await fetch('/api/verify/check-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: importEmail.trim().toLowerCase(),
          code: verificationCode
        })
      });

      const data = await response.json();
      console.log('[VERIFY] Check response:', data);

      if (data.success === true) {
        if (data.single === true) {
          // Single account - auto-import
          console.log('[VERIFY] Single account found:', data.accountName);

          localStorage.setItem('innopay_accountName', data.accountName);
          localStorage.setItem('innopay_masterPassword', data.masterPassword || '');

          if (data.keys) {
            localStorage.setItem('innopay_activePrivate', data.keys.active);
            localStorage.setItem('innopay_postingPrivate', data.keys.posting);
            localStorage.setItem('innopay_memoPrivate', data.keys.memo);
          }

          // Redirect to main page
          window.location.href = '/';

        } else {
          // Multiple accounts - show selection
          console.log('[VERIFY] Multiple accounts found:', data.accounts);
          setMultipleAccounts(data.accounts);
          setImportStep('select');
          setImportLoading(false);
        }
      } else if (data.error) {
        setImportError(data.error);
        setTimeout(() => {
          setImportError('');
          setImportLoading(false);
        }, 3000);
      }
    } catch (error) {
      console.error('[VERIFY] Network error:', error);
      setImportError('Erreur de connexion au serveur');
      setTimeout(() => {
        setImportError('');
        setImportLoading(false);
      }, 3000);
    }
  };

  // Handle account selection (when multiple accounts found)
  const handleSelectAccount = async (accountName: string) => {
    setImportLoading(true);
    setImportError('');

    try {
      console.log('[VERIFY] Selecting account:', accountName);

      const response = await fetch('/api/verify/get-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountName,
          email: importEmail.trim().toLowerCase()
        })
      });

      const data = await response.json();
      console.log('[VERIFY] Credentials response:', data);

      if (data.accountName) {
        localStorage.setItem('innopay_accountName', data.accountName);
        localStorage.setItem('innopay_masterPassword', data.masterPassword || '');

        if (data.keys) {
          localStorage.setItem('innopay_activePrivate', data.keys.active);
          localStorage.setItem('innopay_postingPrivate', data.keys.posting);
          localStorage.setItem('innopay_memoPrivate', data.keys.memo);
        }

        // Redirect to main page
        window.location.href = '/';
      } else if (data.error) {
        setImportError(data.error);
        setTimeout(() => {
          setImportError('');
          setImportLoading(false);
        }, 3000);
      }
    } catch (error) {
      console.error('[VERIFY] Network error:', error);
      setImportError('Erreur de connexion au serveur');
      setTimeout(() => {
        setImportError('');
        setImportLoading(false);
      }, 3000);
    }
  };

  const renderAccountCreationForm = () => (
    <>
      {/* Logo in blue frame (positioned near top of page) */}
      <div className="flex flex-col items-center mt-8 mb-8 p-4 bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-500 rounded-lg shadow-lg w-9/10 text-center">
        <div className="relative w-[80%] h-auto aspect-video">
          <Image
            src={innopayLogoUrl}
            alt="Innopay Logo"
            fill
            className="object-contain"
            priority={true}
          />
        </div>
      </div>

      {/* Show two-button choice if user hasn't made a choice yet */}
      {userChoice === null && (
        <div className="flex flex-col items-center gap-6 w-full max-w-3xl px-4 sm:px-0">
          <p className="text-lg text-center text-gray-700 mb-2">
            Bienvenue! Choisissez une option:
          </p>

          {/* Side-by-side buttons on desktop, stacked on mobile */}
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full">
            {/* Create Account - Primary Action (shown first/left) */}
            <button
              onClick={() => setUserChoice('create')}
              className="w-full sm:w-1/2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold py-4 px-6 rounded-lg transition duration-300 shadow-lg order-1"
            >
              Créez votre compte Innopay
              <span className="block text-sm font-normal mt-1 opacity-90">Create your Innopay account</span>
            </button>

            {/* Import Account - Secondary Action (shown second/right, mother-of-pearl grey) */}
            <button
              onClick={() => setUserChoice('import')}
              className="w-full sm:w-1/2 bg-gradient-to-r from-gray-100 to-gray-200 hover:from-gray-200 hover:to-gray-300 text-gray-900 font-semibold py-4 px-6 rounded-lg transition duration-300 shadow-md border border-gray-300 order-2"
            >
              Importer un compte
              <span className="block text-sm font-normal mt-1 opacity-75">Import an account</span>
            </button>
          </div>
        </div>
      )}

      {/* Show import form if user chose import */}
      {userChoice === 'import' && (
        <div className="w-full max-w-md px-4 sm:px-0">
          <button
            onClick={() => setUserChoice(null)}
            className="mb-4 text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
          >
            <span>←</span> Retour / Back
          </button>

          <h2 className="text-2xl font-bold text-gray-900 mb-4 text-center">
            Importer un compte
          </h2>
          <p className="text-sm text-gray-600 mb-6 text-center">
            Enter your email to recover your account.
            <br />
            <span className="italic">Entrez votre email pour récupérer votre compte.</span>
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={importEmail}
                onChange={(e) => setImportEmail(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !importLoading && importStep === 'email') {
                    handleRequestCode();
                  }
                }}
                placeholder="your.email@example.com"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                disabled={importLoading}
                autoFocus
              />
            </div>

            {importError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                {importError}
              </div>
            )}

            <div className="text-xs text-gray-500">
              Attempts remaining: {importAttempts} / 5
            </div>

            {/* Step 1: Email entry */}
            {importStep === 'email' && (
              <button
                onClick={handleRequestCode}
                disabled={importLoading || importAttempts <= 0}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-lg font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importLoading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Sending code...
                  </span>
                ) : (
                  'Send Verification Code / Envoyer le code'
                )}
              </button>
            )}

            {/* Step 2: Code entry */}
            {importStep === 'code' && (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-lg text-sm">
                  ✉️ Code sent to {importEmail}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Verification Code / Code de vérification
                  </label>
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !importLoading && verificationCode.length === 6) {
                        handleVerifyCode();
                      }
                    }}
                    placeholder="123456"
                    maxLength={6}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white text-center text-2xl font-mono tracking-widest"
                    disabled={importLoading}
                    autoFocus
                  />
                </div>

                <button
                  onClick={handleVerifyCode}
                  disabled={importLoading || verificationCode.length !== 6}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-lg font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {importLoading ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Verifying...
                    </span>
                  ) : (
                    'Verify Code / Vérifier le code'
                  )}
                </button>

                <button
                  onClick={() => {
                    setImportStep('email');
                    setVerificationCode('');
                    setImportError('');
                  }}
                  className="w-full text-blue-600 hover:text-blue-800 text-sm"
                >
                  ← Use a different email / Utiliser un autre email
                </button>
              </div>
            )}

            {/* Step 3: Account selection (multiple accounts) */}
            {importStep === 'select' && (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2 rounded-lg text-sm">
                  📋 {multipleAccounts.length} accounts found / comptes trouvés
                </div>

                <div className="space-y-3">
                  {multipleAccounts.map((account) => (
                    <div
                      key={account.accountName}
                      className="border-2 border-gray-200 rounded-lg p-4 hover:border-blue-500 transition-colors cursor-pointer"
                      onClick={() => handleSelectAccount(account.accountName)}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-semibold text-gray-900">{account.accountName}</div>
                          <div className="text-sm text-gray-500">
                            Created: {new Date(account.creationDate).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-blue-600">{account.euroBalance.toFixed(2)} €</div>
                          <div className="text-xs text-gray-500">Balance</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Show account creation form if user chose create */}
      {userChoice === 'create' && (
        <>
          <button
            onClick={() => setUserChoice(null)}
            className="mb-4 text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
          >
            <span>←</span> Retour / Back
          </button>

          <h1 className="text-3xl sm:text-4xl font-bold text-blue-900 text-center mb-8">
            Créez votre compte Innopay
          </h1>

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
          className={`w-full p-4 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 transition-colors duration-300 text-gray-900
            ${accountName.length > 0 ? (isUsernameValid ? 'bg-green-200/50' : 'bg-red-200/50') : 'bg-white'}`}
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
        className="w-full p-4 border-2 border-blue-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg font-semibold text-gray-900 bg-white"
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
            onChange={(e) => {
              const isChecked = e.target.checked;
              setMockAccountCreation(isChecked);

              // When checked, generate a random mock account name
              if (isChecked) {
                const randomNum = Math.floor(Math.random() * 10000);
                const mockName = `mockaccount${randomNum}`;
                setAccountName(mockName);
                setIsUsernameValid(true);
                setUsingSuggestedUsername(false);
                console.log('[MOCK] Generated mock account name:', mockName);
              } else {
                // When unchecked, restore suggested username if available
                if (suggestedUsername) {
                  setAccountName(suggestedUsername);
                  setIsUsernameValid(true);
                  setUsingSuggestedUsername(true);
                  console.log('[MOCK] Restored suggested username:', suggestedUsername);
                } else {
                  setAccountName('');
                  setIsUsernameValid(false);
                }
              }
            }}
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
                {/* Language Selector */}
                <div className="w-full flex justify-center gap-2 mb-4">
                  {(['fr', 'en', 'de', 'lb'] as Language[]).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setLanguage(lang)}
                      className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                        language === lang
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {lang.toUpperCase()}
                    </button>
                  ))}
                </div>

                {/* Success Message */}
                <div className="mt-6 px-4 py-6 w-full bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-500 rounded-lg text-center">
                  <p className="text-lg font-semibold text-blue-900 mb-3">
                    {translations[language].accountIs}
                  </p>
                  <p className="font-mono font-bold text-2xl text-blue-900 break-all mb-4">
                    {existingAccount?.accountName}
                  </p>
                  {existingAccount?.email && (
                    <>
                      <p className="text-sm text-blue-800 mb-1">
                        {translations[language].registeredWith}
                      </p>
                      <p className="font-mono text-base text-blue-900 break-all mb-4">
                        {existingAccount.email}
                      </p>
                    </>
                  )}
                  <p className="text-base text-gray-700 mt-4">
                    {translations[language].callToAction}
                  </p>
                </div>

                {/* MiniWallet Component - Fixed with proper onClose */}
                {accountBalance !== null && showWalletBalance && (
                  <div className="w-full my-4">
                    <MiniWallet
                      balance={{
                        accountName: existingAccount?.accountName || '',
                        euroBalance: accountBalance
                      }}
                      onClose={() => setShowWalletBalance(false)}
                      visible={showWalletBalance}
                      title="Votre portefeuille Innopay"
                      initialPosition={{
                        x: typeof window !== 'undefined' ? (window.innerWidth / 2) - 150 : 0,
                        y: 20
                      }}
                    />
                  </div>
                )}

                {/* Wallet Reopen Button */}
                {accountBalance !== null && !showWalletBalance && (
                  <WalletReopenButton
                    onClick={() => setShowWalletBalance(true)}
                    visible={true}
                  />
                )}

                {/* Action Buttons - Explorer above Beautify, with dynamic behavior based on restaurant param */}
                <div className="w-full flex flex-col sm:flex-row gap-4 mt-6">
                  {(() => {
                    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
                    const restaurant = params.get('restaurant');
                    const table = params.get('table');

                    // Determine button text based on flow type and restaurant parameter
                    const flow = params.get('flow');
                    let exploreButtonText;

                    if (flow === 'pay_with_topup') {
                      // Flow 7: Need to topup first
                      exploreButtonText = language === 'fr' ? 'Continuer vers le paiement'
                                        : language === 'de' ? 'Weiter zur Zahlung'
                                        : language === 'lb' ? 'Weidergoen zur Bezuelung'
                                        : 'Continue to payment';
                    } else if (restaurant) {
                      // Flow 4 & 5: Return to merchant
                      exploreButtonText = translations[language].returnToMerchant;
                    } else {
                      exploreButtonText = translations[language].exploreShops;
                    }

                    const exploreButtonAction = async () => {
                      // Check flow type - Flow 7 requires topup first
                      const flow = params.get('flow');

                      if (flow === 'pay_with_topup') {
                        // FLOW 7: Redirect to landing page (/) for topup with all params preserved
                        console.log('[FLOW 7] Redirecting to landing page for topup');
                        const currentParams = window.location.search;
                        window.location.href = `/${currentParams}`;
                        return;
                      }

                      if (restaurant && spokeData) {
                        // FLOW 4 & 5: Return to restaurant site with environment-aware URL (hub-and-spoke architecture)
                        // Uses database-driven spoke data for URL resolution
                        const spokeBaseUrl = getSpokeBaseUrl(spokeData);
                        const restaurantUrl = `${spokeBaseUrl}${spokeData.path}`;

                        const returnUrl = new URL(restaurantUrl, window.location.origin);
                        if (table) returnUrl.searchParams.set('table', table);

                        // CRITICAL: Create credential session for Flow 4 consistency with Flow 5
                        // This allows the spoke to import credentials just like Flow 5 does
                        const { prepareUrlWithCredentials } = await import('@/lib/credential-session');

                        const finalUrl = await prepareUrlWithCredentials(returnUrl.toString(), '4');

                        window.location.href = finalUrl;
                      } else if (restaurant && !spokeData) {
                        // Spoke data not yet loaded - wait and retry
                        console.warn('[FLOW 4/5] Spoke data not loaded yet, retrying...');
                        setTimeout(exploreButtonAction, 100);
                        return;
                      } else {
                        // Navigate to Innopay shops
                        window.location.href = '/';
                      }
                    };

                    return (
                      <>
                        {/* Explorer/Return Button - Now FIRST (more prominent) */}
                        <button
                          onClick={exploreButtonAction}
                          className="flex-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-4 px-6 rounded-lg transition duration-300 shadow-lg"
                        >
                          {exploreButtonText}
                        </button>

                        {/* Beautify Profile Button - Now SECOND */}
                        <button
                          onClick={() => setShowUpdateForm(true)}
                          className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 px-6 rounded-lg transition duration-300"
                        >
                          {translations[language].beautifyProfile}
                        </button>
                      </>
                    );
                  })()}
                </div>
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
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-gray-900 bg-white"
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
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-gray-900 bg-white"
                    ></textarea>
                  </div>
                  <div>
                    <label htmlFor="website" className="block text-sm font-medium text-gray-700">Website</label>
                    <input
                      type="url"
                      id="website"
                      value={metadata.website}
                      onChange={(e) => setMetadata({ ...metadata, website: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-gray-900 bg-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="location" className="block text-sm font-medium text-gray-700">Location</label>
                    <input
                      type="text"
                      id="location"
                      value={metadata.location}
                      onChange={(e) => setMetadata({ ...metadata, location: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-gray-900 bg-white"
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

      {/* Account Found Modal */}
      {showAccountFoundModal && modalAccountInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-blue-900 mb-4">
              {translations[language].accountFoundTitle}
            </h2>
            <p className="text-gray-700 mb-4">
              {translations[language].accountFoundMessage}
            </p>
            <div className="bg-blue-50 border-2 border-blue-500 rounded-lg p-4 mb-4">
              <p className="font-mono font-bold text-xl text-blue-900 break-all mb-3">
                {modalAccountInfo.accountName}
              </p>
              {modalAccountInfo.email && (
                <p className="text-sm text-gray-700 mb-3">
                  {modalAccountInfo.email}
                </p>
              )}
              <p className="text-lg font-semibold text-gray-800">
                {translations[language].currentBalance}
              </p>
              <p className="text-2xl font-bold text-green-600">
                {modalAccountInfo.balance.toFixed(2)} €
              </p>
            </div>
            <button
              onClick={() => proceedWithFlow && proceedWithFlow()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors"
            >
              {translations[language].okButton}
            </button>
          </div>
        </div>
      )}

      {/* Insufficient Balance Modal */}
      {showInsufficientBalanceModal && modalTopupInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-orange-900 mb-4">
              {translations[language].insufficientBalanceTitle}
            </h2>
            <p className="text-gray-700 mb-4">
              {translations[language].insufficientBalanceMessage}
            </p>
            <div className="bg-orange-50 border-2 border-orange-500 rounded-lg p-4 mb-4">
              <div className="mb-3">
                <p className="text-sm text-gray-700">
                  {translations[language].currentBalance}
                </p>
                <p className="text-xl font-bold text-gray-800">
                  {modalTopupInfo.currentBalance.toFixed(2)} €
                </p>
              </div>
              <div className="mb-3">
                <p className="text-sm text-gray-700">
                  {translations[language].orderAmount}
                </p>
                <p className="text-xl font-bold text-gray-800">
                  {modalTopupInfo.orderAmount.toFixed(2)} €
                </p>
              </div>
              <div className="border-t-2 border-orange-300 pt-3 mt-3">
                <p className="text-sm text-gray-700">
                  {translations[language].topupRequired}
                </p>
                <p className="text-2xl font-bold text-orange-600">
                  {modalTopupInfo.topupAmount.toFixed(2)} €
                </p>
              </div>
            </div>
            <button
              onClick={() => proceedWithFlow && proceedWithFlow()}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 px-4 rounded-lg transition-colors"
            >
              {translations[language].continueButton}
            </button>
          </div>
        </div>
      )}

      {/* DEV ONLY: Clear localStorage button */}
      {(typeof window !== 'undefined') && (window.location.hostname === 'localhost' ||
        window.location.hostname.includes('127.0.0.1') ||
        window.location.hostname.startsWith('192.168.')) && (
        <div className="fixed top-2 right-2 z-[10001]">
          <button
            onClick={() => {
              if (confirm('Clear all localStorage and reset import attempts (dev only)?')) {
                // Clear all innopay-related items
                localStorage.removeItem('innopay_accountName');
                localStorage.removeItem('innopay_masterPassword');
                localStorage.removeItem('innopay_activePrivate');
                localStorage.removeItem('innopay_postingPrivate');
                localStorage.removeItem('innopay_memoPrivate');
                localStorage.removeItem('innopay_credentialToken');
                localStorage.removeItem('innopay_accounts');
                localStorage.removeItem('innopay_wallet_credentials');

                // Reset import attempts counter to 5
                localStorage.setItem('innopay_import_attempts', '5');

                console.log('[DEV] localStorage cleared and import attempts reset to 5');
                alert('localStorage cleared & counter reset to 5! Reloading...');
                window.location.reload();
              }
            }}
            className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1 rounded shadow-lg font-mono"
            title="Development only: Clear localStorage and reset import counter"
          >
            🧹 Clear LS
          </button>
        </div>
      )}
    </div>
  );
}