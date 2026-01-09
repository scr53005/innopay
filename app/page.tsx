'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Draggable from '@/app/components/Draggable';
import MiniWallet, { WalletReopenButton } from '@/app/components/MiniWallet';
import { getAccountCredentials } from '@/app/actions/get-credentials';
import { useBalance } from '@/hooks/useBalance';

const innopayLogoUrl = "/innopay.svg";

// Spoke type from database
interface Spoke {
  id: string;
  name: string;
  type: string;
  domain_prod: string;
  port_dev: number;
  path: string;
  attribute_name_1: string | null;
  attribute_default_1: string | null;
  attribute_storage_key_1: string | null;
  attribute_name_2: string | null;
  attribute_default_2: string | null;
  attribute_storage_key_2: string | null;
  attribute_name_3: string | null;
  attribute_default_3: string | null;
  attribute_storage_key_3: string | null;
  image_1: string | null;
  image_2: string | null;
  image_3: string | null;
  has_delivery: boolean;
  ready: boolean;
}

// Helper function to get spoke base URL based on environment (hub-and-spoke architecture)
const getSpokeBaseUrl = (spoke: Spoke): string => {
  if (typeof window === 'undefined') {
    // SSR fallback
    return `http://localhost:${spoke.port_dev}`;
  }

  const hostname = window.location.hostname;

  // Production environment
  if (hostname === 'wallet.innopay.lu') {
    return `https://${spoke.domain_prod}`;
  }

  // Mobile testing (Android/iOS on local network)
  // Use same IP as hub but spoke's dev port
  if (hostname.startsWith('192.168.')) {
    return `http://${hostname}:${spoke.port_dev}`;
  }

  // Desktop/localhost testing
  return `http://localhost:${spoke.port_dev}`;
};

// Helper function to build full spoke URL with path and query params
const buildSpokeUrl = (spoke: Spoke): string => {
  const baseUrl = getSpokeBaseUrl(spoke);
  const fullPath = `${baseUrl}${spoke.path}`;

  const params = new URLSearchParams();

  // Process each attribute slot (1-3)
  for (let i = 1; i <= 3; i++) {
    const name = spoke[`attribute_name_${i}` as keyof Spoke] as string | null;
    if (!name) continue; // No attribute defined, skip

    const storageKey = spoke[`attribute_storage_key_${i}` as keyof Spoke] as string | null;
    const defaultValue = spoke[`attribute_default_${i}` as keyof Spoke] as string | null;

    let value: string | null = null;

    // Priority 1: Check localStorage if storage key is defined
    if (storageKey && typeof window !== 'undefined') {
      value = localStorage.getItem(storageKey);
    }

    // Priority 2: Use default if no localStorage value found
    if (!value && defaultValue) {
      value = defaultValue;
    }

    // Only add parameter if we have a value
    if (value) {
      params.append(name, value);
    }
  }

  const queryString = params.toString();
  return queryString ? `${fullPath}?${queryString}` : fullPath;
};

// Nearby businesses will be fetched from database

// Translations for the UI
const translations = {
  fr: {
    title: "Bienvenue sur Innopay",
    amountLabel: "Montant (EUR)",
    createAndTopUp: "Créer et Recharger",
    topUpWallet: "Recharger Votre Portefeuille",
    minAmount: "Montant minimum: 15€",
    maxAmount: "Montant maximum: 999€",
    nearbyBusinesses: "Commerces à proximité acceptant Innopay",
    lowBalanceWarning: "Votre solde est trop bas, veuillez recharger votre portefeuille d'abord."
  },
  en: {
    title: "Welcome to Innopay",
    amountLabel: "Amount (EUR)",
    createAndTopUp: "Create and Top Up",
    topUpWallet: "Top Up Your Wallet",
    minAmount: "Minimum amount: 15€",
    maxAmount: "Maximum amount: 999€",
    nearbyBusinesses: "Nearby businesses accepting Innopay",
    lowBalanceWarning: "Your balance is too low, please top up your wallet first."
  },
  de: {
    title: "Willkommen bei Innopay",
    amountLabel: "Betrag (EUR)",
    createAndTopUp: "Erstellen und Aufladen",
    topUpWallet: "Brieftasche Aufladen",
    minAmount: "Mindestbetrag: 15€",
    maxAmount: "Höchstbetrag: 999€",
    nearbyBusinesses: "Geschäfte in der Nähe, die Innopay akzeptieren",
    lowBalanceWarning: "Ihr Guthaben ist zu niedrig, bitte laden Sie zuerst Ihre Brieftasche auf."
  },
  lb: {
    title: "Wëllkomm bei Innopay",
    amountLabel: "Betrag (EUR)",
    createAndTopUp: "Erstellen an Oplueden",
    topUpWallet: "Äre Portemonnaie Oplueden",
    minAmount: "Mindestbetrag: 15€",
    maxAmount: "Maximal Betrag: 999€",
    nearbyBusinesses: "Geschäfter an der Noperschaft déi Innopay akzeptéieren",
    lowBalanceWarning: "Äert Solde ass ze niddreg, luet w.e.g. Äre Portemonnaie éischt op."
  }
};

type Language = 'fr' | 'en' | 'de' | 'lb';

function TopUpContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [amount, setAmount] = useState(100);
  const [language, setLanguage] = useState<Language>('fr');
  const [hasAccount, setHasAccount] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Mini-wallet state
  const [showWalletBalance, setShowWalletBalance] = useState(false);
  const [walletBalance, setWalletBalance] = useState<{
    accountName: string;
    euroBalance: number;
  } | null>(null);

  // Import account state (for corrupted localStorage)
  const [showImportModal, setShowImportModal] = useState(false);
  const [importEmail, setImportEmail] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importAttempts, setImportAttempts] = useState(5);

  // State for showing nearby businesses (balance >= 4.99€)
  const [showNearbyBusinesses, setShowNearbyBusinesses] = useState(false);

  // State for spokes (fetched from database)
  const [spokes, setSpokes] = useState<Spoke[]>([]);
  const [spokesLoading, setSpokesLoading] = useState(true);

  // State for order context from indiesmenu (Flow 7: pay_with_topup)
  const [orderContext, setOrderContext] = useState<{
    table: string;
    orderAmount: string;
    orderMemo: string;
    returnUrl: string;
  } | null>(null);

  const t = translations[language];

  // Get account name for React Query balance fetching
  const accountName = typeof window !== 'undefined'
    ? (localStorage.getItem('innopay_accountName') || localStorage.getItem('innopayAccountName'))
    : null;

  // Fetch balance using React Query (replaces manual fetchWalletBalance)
  const { balance, isLoading: balanceLoading, refetch: refetchBalance, source: balanceSource } = useBalance(accountName, {
    enabled: !!accountName && !accountName.startsWith('mockaccount'),
  });

  // Sync React Query balance to walletBalance state
  useEffect(() => {
    if (balance !== null && accountName) {
      console.log('[React Query] Syncing balance to state:', balance, 'source:', balanceSource);
      setWalletBalance({
        accountName,
        euroBalance: balance
      });
      setShowWalletBalance(true);

      // Check if we should show nearby businesses
      if (balance >= 4.99) {
        console.log('[React Query] Balance >= 4.99€ - showing nearby businesses');
        setShowNearbyBusinesses(true);
      } else {
        setShowNearbyBusinesses(false);
      }
    }
  }, [balance, accountName, balanceSource]);

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

  // Read URL parameters and set initial amount
  useEffect(() => {
    const topupParam = searchParams.get('topup');
    if (topupParam) {
      const topupAmount = parseFloat(topupParam);
      if (!isNaN(topupAmount) && topupAmount > 0) {
        // Clamp to valid range (15-999)
        const clampedAmount = Math.max(15, Math.min(999, Math.round(topupAmount)));
        setAmount(clampedAmount);
      }
    }
  }, [searchParams]);

  // Fetch active spokes from database
  useEffect(() => {
    const fetchSpokes = async () => {
      try {
        setSpokesLoading(true);
        const response = await fetch('/api/spokes');
        if (!response.ok) {
          throw new Error('Failed to fetch spokes');
        }
        const data = await response.json();
        setSpokes(data.spokes || []);
      } catch (error) {
        console.error('Error fetching spokes:', error);
        setSpokes([]); // Fallback to empty array
      } finally {
        setSpokesLoading(false);
      }
    };

    fetchSpokes();
  }, []);

  // FLOW 7: Handle incoming context from indiesmenu (pay_with_topup)
  // This must run EARLY to overwrite localStorage before account detection
  useEffect(() => {
    const topupFor = searchParams.get('topup_for');
    const source = searchParams.get('source');

    if (topupFor === 'order' && source === 'indiesmenu') {
      console.log('[FLOW 7] Detected incoming order context from indiesmenu');

      // Extract all context parameters
      const account = searchParams.get('account');
      const balance = searchParams.get('balance');
      const deficit = searchParams.get('deficit');
      const table = searchParams.get('table');
      const orderAmount = searchParams.get('order_amount');
      const orderMemo = decodeURIComponent(searchParams.get('order_memo') || '');
      const returnUrl = decodeURIComponent(searchParams.get('return_url') || '');

      console.log('[FLOW 7] Extracted context:', {
        account,
        balance,
        deficit,
        table,
        orderAmount,
        orderMemo: orderMemo.substring(0, 50) + '...',
        returnUrl
      });

      // Validate required params
      if (!account || !deficit || !table || !orderAmount) {
        console.error('[FLOW 7] Missing required parameters');
        return;
      }

      // STEP 1: Ensure MiniWallet shows the correct account
      // Override localStorage accountName to match the account from indiesmenu
      const currentAccount = localStorage.getItem('innopay_accountName');
      if (currentAccount !== account) {
        console.log(`[FLOW 7] Account mismatch detected - overriding '${currentAccount}' with '${account}'`);
        localStorage.setItem('innopay_accountName', account);

        // Set balance if available
        if (balance) {
          const balanceNum = parseFloat(balance);
          if (!isNaN(balanceNum)) {
            localStorage.setItem('innopay_lastBalance', balanceNum.toFixed(2));
          }
        }
      } else {
        console.log(`[FLOW 7] Account already matches: ${account}`);
      }

      // STEP 2: Auto-import credentials from database if not in localStorage
      const activePrivate = localStorage.getItem('innopay_activePrivate');
      const masterPassword = localStorage.getItem('innopay_masterPassword');

      if (!activePrivate || !masterPassword) {
        console.log(`[FLOW 7] Missing credentials in localStorage, fetching from database for account: ${account}`);

        // Use IIFE to handle async call in useEffect
        (async () => {
          try {
            // Call Server Action (secure, server-side only)
            const result = await getAccountCredentials(account);

            if (result.success && result.accountName) {
              console.log(`[FLOW 7] Successfully fetched credentials from ${result.source}`);

              // Import all credentials to localStorage
              localStorage.setItem('innopay_accountName', result.accountName);
              localStorage.setItem('innopay_masterPassword', result.masterPassword || '');
              localStorage.setItem('innopay_activePrivate', result.activePrivate || '');
              localStorage.setItem('innopay_activePublic', result.activePublic || '');
              localStorage.setItem('innopay_postingPrivate', result.postingPrivate || '');
              localStorage.setItem('innopay_postingPublic', result.postingPublic || '');
              localStorage.setItem('innopay_memoPrivate', result.memoPrivate || '');
              localStorage.setItem('innopay_memoPublic', result.memoPublic || '');

              if (result.euroBalance && result.euroBalance > 0) {
                localStorage.setItem('innopay_lastBalance', result.euroBalance.toFixed(2));
              }

              console.log(`[FLOW 7] ✅ Credentials auto-imported successfully`);
            } else {
              console.warn(`[FLOW 7] Could not fetch credentials from database: ${result.error}`);
            }
          } catch (error) {
            console.error(`[FLOW 7] Error auto-importing credentials:`, error);
          }
        })();
      } else {
        console.log(`[FLOW 7] Credentials already present in localStorage`);
      }

      // STEP 3: Calculate suggested topup amount - Round UP to nearest 5€
      const deficitNum = parseFloat(deficit);

      // Round deficit UP to nearest euro first
      const deficitRoundedUp = Math.ceil(deficitNum);

      // Then round UP to nearest 5€ increment
      const suggestedTopup = Math.max(
        Math.ceil(deficitRoundedUp / 5) * 5, // Round up to nearest 5€
        15 // Minimum 15€
      );

      console.log('[FLOW 7] Calculated suggested topup:', {
        deficitRaw: deficitNum,
        deficitRoundedUp: deficitRoundedUp,
        suggestedTopup: suggestedTopup,
        minimum: 15
      });

      // STEP 4: Pre-fill amount (already rounded to 5€ increment)
      const clampedAmount = Math.max(15, Math.min(999, suggestedTopup));
      setAmount(clampedAmount);
      console.log('[FLOW 7] Pre-filled amount:', clampedAmount);

      // STEP 5: Store order context for UI display
      if (table && orderAmount && returnUrl) {
        setOrderContext({
          table,
          orderAmount,
          orderMemo,
          returnUrl
        });
        console.log('[FLOW 7] Stored order context for UI display');
      }

      // STEP 6: Trigger account detection (will happen in main useEffect)
      setHasAccount(true);
    }
  }, [searchParams]);

  // Get redirect parameters from URL (for returning from indiesmenu)
  const getRedirectParams = () => {
    const table = searchParams.get('table');
    const orderAmount = searchParams.get('order_amount');
    const orderMemo = searchParams.get('order_memo') ? decodeURIComponent(searchParams.get('order_memo')!) : undefined;

    // Return params if there's an order (indicated by order_amount)
    if (orderAmount && parseFloat(orderAmount) > 0) {
      return { table, orderAmount, orderMemo };
    }
    return null;
  };

  // Fetch HBD balance from Hive blockchain for reconciliation
  // TODO: Implement reconciliation mechanism in future iteration
  const fetchHBDBalance = useCallback(async (accountName: string): Promise<number> => {
    console.log('[HBD BALANCE] Fetching HBD balance for:', accountName);

    try {
      // Fetch account data from Hive blockchain
      const response = await fetch('https://api.hive.blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'condenser_api.get_accounts',
          params: [[accountName]],
          id: 1
        })
      });

      const data = await response.json();

      if (data.result && data.result.length > 0) {
        const account = data.result[0];
        const hbdBalance = parseFloat(account.hbd_balance.split(' ')[0]);
        console.log('[HBD BALANCE] HBD balance retrieved:', hbdBalance);
        return hbdBalance;
      }
    } catch (error) {
      console.error('[HBD BALANCE] Error fetching HBD balance:', error);
    }

    return 0;
  }, []);

  // DEPRECATED (2026-01-09): Replaced by React Query useEffect (lines 197-214)
  // This manual balance check is no longer needed - React Query handles it automatically
  // const checkBalanceAndShowBusinesses = useCallback(..., []);

  // DEPRECATED (2026-01-09): Replaced by React Query useBalance hook
  // This manual fetch is no longer used - React Query automatically handles balance fetching
  // const fetchWalletBalance = useCallback(async (accountName: string) => { ... }, []);

  // Check if user has an account in localStorage and fetch balance
  // If no URL params and no account, redirect to account creation
  useEffect(() => {
    // Check for credential token (from successful account creation via success page redirect)
    const credentialToken = localStorage.getItem('innopay_credentialToken');

    if (credentialToken) {
      console.log('[LANDING] Found credential token, fetching full credentials...');

      // Fetch full credentials from API
      fetch('/api/account/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentialToken })
      })
        .then(res => {
          if (!res.ok) {
            // Handle 410 Gone (token expired or already used)
            if (res.status === 410) {
              console.warn('[LANDING] Credential token expired or already used, cleaning up');
              localStorage.removeItem('innopay_credentialToken');
              return null;
            }
            throw new Error(`API error: ${res.status}`);
          }
          return res.json();
        })
        .then(credentials => {
          // If token was expired/used, credentials will be null
          if (!credentials) {
            return;
          }

          // Validate the credentials object structure
          if (!credentials || !credentials.accountName || !credentials.masterPassword ||
              !credentials.keys || !credentials.keys.active || !credentials.keys.posting ||
              !credentials.keys.memo) {
            throw new Error('Invalid credentials structure received from API');
          }

          console.log('[LANDING] Storing full credentials for:', credentials.accountName);

          // Store all credentials in localStorage
          localStorage.setItem('innopay_accountName', credentials.accountName);
          localStorage.setItem('innopay_masterPassword', credentials.masterPassword);
          localStorage.setItem('innopay_activePrivate', credentials.keys.active.privateKey);
          localStorage.setItem('innopay_postingPrivate', credentials.keys.posting.privateKey);
          localStorage.setItem('innopay_memoPrivate', credentials.keys.memo.privateKey);

          // Store the initial balance from credential session
          if (credentials.euroBalance !== undefined) {
            localStorage.setItem('innopay_lastBalance', credentials.euroBalance.toString());
            console.log('[LANDING] Saved initial balance to localStorage:', credentials.euroBalance);
          }

          // Remove the token (one-time use)
          localStorage.removeItem('innopay_credentialToken');

          // Set account state (React Query will auto-fetch balance)
          setHasAccount(true);
          // Note: fetchWalletBalance removed - React Query useBalance hook handles this
        })
        .catch(err => {
          console.error('[LANDING] Error fetching credentials:', err);
          // Clean up the invalid token
          localStorage.removeItem('innopay_credentialToken');
          // Redirect to account creation since credentials couldn't be fetched (preserve params)
          const currentParams = window.location.search;
          router.push(`/user${currentParams}`);
        });

      return; // Don't do other checks while fetching credentials
    }

    const accountName = localStorage.getItem('innopay_accountName') || localStorage.getItem('innopayAccountName');
    const activePrivate = localStorage.getItem('innopay_activePrivate');
    const masterPassword = localStorage.getItem('innopay_masterPassword');

    // Check if there are any URL parameters
    const hasSearchParams = Array.from(searchParams.keys()).length > 0;

    // Validate that if accountName exists, the required keys also exist
    // This handles the case where Safari/browser cleared some but not all localStorage items
    if (accountName && (!activePrivate || !masterPassword)) {
      console.warn('[LANDING] Corrupted localStorage detected (accountName exists but keys missing) - showing import modal');
      // Clear corrupted data
      localStorage.removeItem('innopay_accountName');
      localStorage.removeItem('innopayAccountName');
      localStorage.removeItem('innopay_activePrivate');
      localStorage.removeItem('innopay_postingPrivate');
      localStorage.removeItem('innopay_memoPrivate');
      localStorage.removeItem('innopay_masterPassword');

      // Show import account modal (user had an account before)
      setShowImportModal(true);

      // Don't redirect - let user recover their account
      return;
    }

    // If no search params and no valid account, redirect to account creation
    if (!hasSearchParams && !accountName) {
      console.log('[LANDING] No search params and no account found - redirecting to /user');
      const currentParams = window.location.search;
      router.push(`/user${currentParams}`);
      return;
    }

    setHasAccount(!!accountName && !!activePrivate && !!masterPassword);

    // Note: Balance fetching removed - React Query useBalance hook automatically handles this
    // The hook fetches fresh balance on mount and whenever accountName changes

    // If returning from successful top-up, check if we should redirect to indiesmenu
    const topupSuccess = searchParams.get('topup_success');
    if (topupSuccess === 'true' && accountName) {
      console.log('[LANDING] Returned from successful top-up');

      // Check if this was a top-up initiated from indiesmenu (has table or order params)
      const table = searchParams.get('table');
      const orderAmount = searchParams.get('order_amount');

      if (table || orderAmount) {
        console.log('[LANDING] Top-up was for indiesmenu order, redirecting back to indiesmenu');
        // Build redirect URL to indiesmenu
        const indiesMenuUrl = window.location.hostname === 'wallet.innopay.lu'
          ? 'https://menu.indiesmenu.lu'
          : 'http://localhost:3001';
        const redirectUrl = `${indiesMenuUrl}/?${table ? `table=${table}&` : ''}topup_success=true`;
        console.log('[LANDING] Redirecting to:', redirectUrl);
        window.location.href = redirectUrl;
        return;
      }
    }
  }, [searchParams, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (amount < 15 || amount > 999) {
      setError(t.minAmount + ' / ' + t.maxAmount);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const accountName = localStorage.getItem('innopay_accountName') || localStorage.getItem('innopayAccountName');

      // Fetch email for existing accounts to pre-fill Stripe form
      let userEmail: string | undefined;
      if (hasAccount && accountName) {
        try {
          const emailResponse = await fetch(`/api/account/email?accountName=${accountName}`);
          if (emailResponse.ok) {
            const emailData = await emailResponse.json();
            if (emailData.found && emailData.email) {
              userEmail = emailData.email;
              console.log('[LANDING] Found email for pre-fill:', userEmail);
            }
          }
        } catch (emailError) {
          console.warn('[LANDING] Failed to fetch email for pre-fill:', emailError);
          // Continue without email pre-fill
        }
      }

      // Get redirect parameters if coming from indiesmenu
      // Use orderContext if available (Flow 7), otherwise read from URL
      const redirectParams = orderContext
        ? {
            table: orderContext.table,
            orderAmount: orderContext.orderAmount,
            orderMemo: orderContext.orderMemo
          }
        : getRedirectParams();

      // Extract return_url from URL params as fallback if orderContext doesn't have it
      const returnUrlFromParams = searchParams.get('return_url')
        ? decodeURIComponent(searchParams.get('return_url')!)
        : undefined;
      const finalReturnUrl = orderContext?.returnUrl || returnUrlFromParams;

      console.log('[LANDING] Redirect params:', redirectParams);
      console.log('[LANDING] Order context:', orderContext);
      console.log('[LANDING] Return URL:', {
        fromContext: orderContext?.returnUrl,
        fromParams: returnUrlFromParams,
        final: finalReturnUrl
      });

      // Build flow context for systematic flow detection
      const requestBody = {
        amount,
        accountName: hasAccount ? accountName : undefined,
        email: userEmail,
        redirectParams, // Pass table, orderAmount, orderMemo if present
        hasLocalStorageAccount: hasAccount, // For flow detection
        accountBalance: walletBalance?.euroBalance, // For payment flow decisions
        returnUrl: finalReturnUrl, // Custom return URL for Flow 7 - with fallback to URL params
      };

      console.log('[LANDING] Submitting checkout with flow context:', {
        hasLocalStorageAccount: requestBody.hasLocalStorageAccount,
        accountName: requestBody.accountName,
        accountBalance: requestBody.accountBalance,
        redirectParams: requestBody.redirectParams,
      });

      const response = await fetch('/api/checkout/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Checkout failed');
      }

      const data = await response.json();

      // Redirect to Stripe
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      setLoading(false);
    }
  };

  // Handle import account submission
  const handleImportAccount = async () => {
    // Validate email format
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
      console.log('[IMPORT ACCOUNT] Calling innopay API:', `/api/account/retrieve`);

      const response = await fetch('/api/account/retrieve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: sanitizedEmail })
      });

      // Parse response regardless of status
      const data = await response.json();
      console.log('[IMPORT ACCOUNT] API response:', { status: response.status, data });

      // Check if account was found
      if (data.found === true) {
        console.log('[IMPORT ACCOUNT] Account found:', data.accountName);

        // Save to localStorage
        localStorage.setItem('innopay_accountName', data.accountName);
        localStorage.setItem('innopay_masterPassword', data.masterPassword);

        // Save keys if available
        if (data.keys) {
          localStorage.setItem('innopay_activePrivate', data.keys.active);
          localStorage.setItem('innopay_postingPrivate', data.keys.posting);
          localStorage.setItem('innopay_memoPrivate', data.keys.memo);
          console.log('[IMPORT ACCOUNT] Saved account with all keys');
        } else {
          console.log('[IMPORT ACCOUNT] Saved account (keys not available)');
        }

        // Close modal and reload to show mini-wallet
        setShowImportModal(false);
        console.log('[IMPORT ACCOUNT] Reloading page to activate account');
        window.location.reload();

      } else if (data.found === false) {
        // Account not found - this is expected behavior, not an error
        console.log('[IMPORT ACCOUNT] Account not found for email:', sanitizedEmail);

        // Decrement attempts FIRST
        const newAttempts = importAttempts - 1;
        setImportAttempts(newAttempts);
        localStorage.setItem('innopay_import_attempts', newAttempts.toString());
        console.log('[IMPORT ACCOUNT] Attempts remaining:', newAttempts);

        // Check if out of attempts
        if (newAttempts <= 0) {
          // Final attempt used
          setImportError('No account found in database, sorry! / Rien dans la base de données, désolé!');

          // Redirect to /user after 3 seconds (preserve params for flow context)
          setTimeout(() => {
            const currentParams = window.location.search;
            router.push(`/user${currentParams}`);
          }, 3000);
        } else {
          // Still have attempts remaining
          setImportError(`You may have used a different email / Vous avez peut-être utilisé une adresse mail différente (${newAttempts} attempts left)`);

          // Clear error after 3 seconds to allow retry
          setTimeout(() => {
            setImportError('');
            setImportLoading(false);
          }, 3000);
        }

      } else {
        // Unexpected response format
        console.error('[IMPORT ACCOUNT] Unexpected response format:', data);
        setImportError('Server response error / Erreur de réponse du serveur');
        setTimeout(() => {
          setImportError('');
          setImportLoading(false);
        }, 3000);
      }

    } catch (error) {
      console.error('[IMPORT ACCOUNT] Network or parsing error:', error);
      setImportError('Server connection error / Erreur de connexion au serveur');
      setTimeout(() => {
        setImportError('');
        setImportLoading(false);
      }, 3000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <Image
            src={innopayLogoUrl}
            alt="Innopay Logo"
            width={200}
            height={60}
            priority
          />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-8">
          {t.title}
        </h1>

        {/* Low Balance Warning - Show when balance < 5.00€ AND not from restaurant (Flow 7) */}
        {walletBalance && walletBalance.euroBalance < 5.00 && !orderContext && (
          <div className="mb-6 border-2 border-green-400 rounded-lg p-4 bg-gradient-to-r from-green-50 to-emerald-50 shadow-md">
            <div className="flex items-start gap-3">
              <div className="text-2xl">💡</div>
              <div className="flex-1">
                <p className="text-base font-semibold text-gray-800">
                  {t.lowBalanceWarning}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Order Context Banner - Show when topping up for restaurant order (Flow 7) */}
        {orderContext && (
          <div className="mb-6 border-2 border-orange-400 rounded-lg p-4 bg-gradient-to-r from-orange-50 to-amber-50 shadow-md">
            <div className="flex items-start gap-3">
              <div className="text-2xl">🍽️</div>
              <div className="flex-1">
                <h3 className="font-bold text-gray-800 mb-1">
                  Top-up for Restaurant Order
                </h3>
                <div className="text-sm text-gray-700 space-y-1">
                  <p>📍 Table {orderContext.table}</p>
                  <p>💰 Order Total: {orderContext.orderAmount}€</p>
                  <p className="text-xs text-gray-600 mt-2 italic">
                    After payment, you'll be redirected back to complete your order
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Nearby Businesses - Show ABOVE form if balance >= 4.99€ AND not from restaurant (Flow 7) */}
        {showNearbyBusinesses && !orderContext && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-800 mb-4 text-center">
              {t.nearbyBusinesses}
            </h2>
            <div className="max-h-56 overflow-y-auto border-2 border-blue-300 rounded-lg p-4 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-lg">
              {spokesLoading ? (
                <div className="flex justify-center items-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : spokes.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No businesses available
                </div>
              ) : (
                <div className="space-y-3">
                  {spokes.map((spoke) => (
                    <div
                      key={spoke.id}
                      onClick={async () => {
                        if (!spoke.ready) {
                          // Show alert for coming soon
                          alert(`${spoke.name} coming soon!`);
                          return;
                        }

                        // Build base spoke URL
                        const spokeUrl = buildSpokeUrl(spoke);

                        // FLOW 4: Import credentials to spoke if account exists
                        const { prepareUrlWithCredentials } = await import('@/lib/credential-session');
                        const finalUrl = await prepareUrlWithCredentials(spokeUrl, '4');

                        // Navigate to spoke
                        window.location.href = finalUrl;
                      }}
                      className={`relative flex items-center gap-4 p-4 bg-white rounded-lg transition-all border-2 ${
                        spoke.ready
                          ? 'cursor-pointer hover:shadow-xl hover:scale-[1.02] border-gray-200 hover:border-blue-400'
                          : 'opacity-75 cursor-not-allowed border-gray-300'
                      }`}
                    >
                      {!spoke.ready && (
                        <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded-full font-semibold shadow-md z-10">
                          Coming Soon
                        </div>
                      )}
                      <div className="relative w-20 h-20 flex-shrink-0 bg-gray-200 rounded-lg overflow-hidden shadow-md">
                        {spoke.image_1 && (
                          <Image
                            src={spoke.image_1}
                            alt={spoke.name}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-lg text-gray-900">{spoke.name}</p>
                        <p className="text-sm text-blue-600 font-medium">
                          {spoke.ready ? 'Click to view menu' : 'Opening soon'}
                        </p>
                      </div>
                      {spoke.ready && (
                        <div className="text-blue-500">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Amount Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t.amountLabel}
            </label>
            <input
              type="number"
              min="15"
              max="999"
              step="1"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-4xl font-bold text-center text-gray-900 bg-white"
              disabled={loading}
            />
            <p className="mt-1 text-xs text-gray-500">
              {t.minAmount} / {t.maxAmount}
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 rounded-lg font-semibold text-lg hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </span>
            ) : (
              hasAccount ? t.topUpWallet : t.createAndTopUp
            )}
          </button>
        </form>

        {/* Language Buttons */}
        <div className="mt-8 flex justify-center gap-2">
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
      </div>

      {/* Wallet Balance Reopen Button */}
      <WalletReopenButton
        visible={!showWalletBalance && !!walletBalance}
        onClick={() => setShowWalletBalance(true)}
      />

      {/* Persistent Wallet Balance Indicator */}
      {walletBalance && (
        <MiniWallet
          balance={walletBalance}
          visible={showWalletBalance}
          onClose={() => setShowWalletBalance(false)}
          title="Your Innopay Wallet"
          balanceSource={balanceSource || undefined}
          initialPosition={{
            x: typeof window !== 'undefined' ? (window.innerWidth / 2) - 150 : 0, // Centered (300px max-width / 2)
            y: 20  // 20px from top
          }}
        />
      )}

      {/* Import Account Modal (for corrupted localStorage) */}
      {showImportModal && (
        <Draggable
          className="z-[9999] bg-white rounded-lg shadow-2xl border-2 border-blue-500"
          initialPosition={{
            x: typeof window !== 'undefined' ? (window.innerWidth / 2) - 200 : 0,
            y: typeof window !== 'undefined' ? (window.innerHeight / 2) - 200 : 100
          }}
          style={{
            width: '400px',
            maxWidth: '90vw',
          }}
        >
          <div className="p-6">
            {/* Header with drag handle */}
            <div className="flex items-center gap-2 mb-4">
              <div className="text-gray-400 cursor-move">⋮⋮</div>
              <h3 className="text-lg font-bold text-gray-800 flex-1">
                Import Account / Importer un compte
              </h3>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  // Preserve URL params (flow context, restaurant, table, order info)
                  const currentParams = window.location.search;
                  router.push(`/user${currentParams}`);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                className="text-gray-400 hover:text-gray-600 rounded-full p-1 transition-colors"
                aria-label="Close and go to account creation"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              We detected you had an account before. Enter your email to recover it.
              <br />
              <span className="text-xs italic">Nous avons détecté que vous aviez un compte. Entrez votre email pour le récupérer.</span>
            </p>

            <div className="space-y-4">
              <p className="text-center text-gray-700 mb-4">
                Please go to the account page to import or create your account.
                <br />
                <span className="text-sm italic">Veuillez aller à la page compte pour importer ou créer votre compte.</span>
              </p>

              <button
                onClick={() => {
                  setShowImportModal(false);
                  // Preserve URL params (flow context, restaurant, table, order info)
                  const currentParams = window.location.search;
                  router.push(`/user${currentParams}`);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-lg font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all"
              >
                Go to Account Page / Aller à la page compte
              </button>
            </div>
          </div>
        </Draggable>
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

// Main page component with Suspense boundary
export default function LandingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <TopUpContent />
    </Suspense>
  );
}
