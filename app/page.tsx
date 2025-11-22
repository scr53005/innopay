'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';

const innopayLogoUrl = "/innopay.svg";

// Type for stored account information
interface StoredAccount {
  accountName: string;
  addedAt: string;
}

export default function TopUpPage() {
  const searchParams = useSearchParams();

  // State for account management
  const [storedAccounts, setStoredAccounts] = useState<StoredAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [showAccountDialog, setShowAccountDialog] = useState(false);

  // State for top-up flow
  const [topupAmount, setTopupAmount] = useState(15);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [returnToIndiesmenu, setReturnToIndiesmenu] = useState(false);
  const [indiesTable, setIndiesTable] = useState<string | null>(null);

  // State for success/cancel messages
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);

  // ENTRY POINT HANDLER: Check URL params and localStorage on mount
  useEffect(() => {
    // Check for success or cancelled params
    const topupSuccess = searchParams.get('topup_success');
    const cancelled = searchParams.get('cancelled');

    if (topupSuccess === 'true') {
      // Check if we should return to indiesmenu
      const returnToIndies = sessionStorage.getItem('innopay_return_to_indiesmenu');
      const indiesTableNum = sessionStorage.getItem('innopay_indies_table');

      if (returnToIndies === 'true' && indiesTableNum) {
        console.log('[TOPUP PAGE] Returning to indiesmenu table:', indiesTableNum);
        // Clear session storage
        sessionStorage.removeItem('innopay_return_to_indiesmenu');
        sessionStorage.removeItem('innopay_indies_table');

        // Determine indiesmenu URL
        let indiesUrl: string;
        if (window.location.hostname === 'localhost') {
          indiesUrl = 'http://localhost:3001';
        } else if (window.location.hostname === 'wallet.innopay.lu' || window.location.hostname.includes('vercel.app')) {
          indiesUrl = 'https://indies.innopay.lu';
        } else {
          indiesUrl = `http://${window.location.hostname}:3001`;
        }

        // Redirect back to indiesmenu with topup_success flag
        window.location.href = `${indiesUrl}/menu?table=${indiesTableNum}&topup_success=true`;
        return;
      }

      // Otherwise, show success banner on innopay
      setShowSuccess(true);
      // Clear params from URL
      window.history.replaceState({}, '', window.location.pathname);
      // Hide success message after 5 seconds
      setTimeout(() => setShowSuccess(false), 5000);
    }

    if (cancelled === 'true') {
      setShowCancelled(true);
      // Clear params from URL
      window.history.replaceState({}, '', window.location.pathname);
      // Hide cancelled message after 5 seconds
      setTimeout(() => setShowCancelled(false), 5000);
    }

    // Entry Point 2: Check for ?account= and ?topup= parameters (from indiesmenu)
    const accountParam = searchParams.get('account');
    const topupParam = searchParams.get('topup');
    const tableParam = searchParams.get('table');
    const orderAmountParam = searchParams.get('order_amount');
    const orderMemoParam = searchParams.get('order_memo');

    if (accountParam) {
      console.log('[TOPUP PAGE] Entry Point 2: Called from indiesmenu with account:', accountParam);
      console.log('[TOPUP PAGE] Topup deficit:', topupParam);
      console.log('[TOPUP PAGE] Table:', tableParam);
      console.log('[TOPUP PAGE] Order amount:', orderAmountParam);
      console.log('[TOPUP PAGE] Order memo length:', orderMemoParam?.length);

      // Register this user in localStorage
      registerAccountInLocalStorage(accountParam);

      // Proceed directly to top-up flow for this user
      setSelectedAccount(accountParam);

      // Set topup amount to max(minimum 15€, requested topup amount)
      if (topupParam) {
        const requestedAmount = parseFloat(topupParam);
        if (!isNaN(requestedAmount) && requestedAmount > 0) {
          const suggestedAmount = Math.max(15, requestedAmount);
          setTopupAmount(suggestedAmount);
          console.log('[TOPUP PAGE] Setting topup amount to:', suggestedAmount);
        }
      }

      // Store order info in sessionStorage for checkout
      if (orderAmountParam && orderMemoParam) {
        sessionStorage.setItem('innopay_pending_order_amount', orderAmountParam);
        sessionStorage.setItem('innopay_pending_order_memo', orderMemoParam);
        console.log('[TOPUP PAGE] Stored pending order info');
      }

      // Mark that we should return to indiesmenu after topup
      if (tableParam) {
        setReturnToIndiesmenu(true);
        setIndiesTable(tableParam);
      }

      // Clear params from URL (keep it clean)
      window.history.replaceState({}, '', window.location.pathname);

      return; // Skip the dialog, go straight to top-up
    }

    // Entry Point 1: Check localStorage for existing accounts
    const accounts = getAccountsFromLocalStorage();
    setStoredAccounts(accounts);

    if (accounts.length > 0) {
      console.log('[TOPUP PAGE] Entry Point 1: Found', accounts.length, 'account(s) in localStorage');

      if (accounts.length === 1) {
        // Single account: Show dialog to confirm or create new
        setShowAccountDialog(true);
      } else {
        // Multiple accounts: Show selection dialog
        setShowAccountDialog(true);
      }
    } else {
      console.log('[TOPUP PAGE] Entry Point 1: No accounts found, showing create account option');
    }
  }, [searchParams]);

  // Helper: Get accounts from localStorage
  const getAccountsFromLocalStorage = (): StoredAccount[] => {
    try {
      const stored = localStorage.getItem('innopay_accounts');
      if (stored) {
        return JSON.parse(stored);
      }

      // Legacy support: Check for old single-account storage
      const legacyAccount = localStorage.getItem('innopay_accountName');
      if (legacyAccount) {
        const accounts = [{ accountName: legacyAccount, addedAt: new Date().toISOString() }];
        localStorage.setItem('innopay_accounts', JSON.stringify(accounts));
        return accounts;
      }
    } catch (e) {
      console.error('Error reading from localStorage:', e);
    }
    return [];
  };

  // Helper: Register account in localStorage
  const registerAccountInLocalStorage = (accountName: string) => {
    try {
      const accounts = getAccountsFromLocalStorage();

      // Check if account already exists
      if (accounts.some(acc => acc.accountName === accountName)) {
        console.log('[TOPUP PAGE] Account already registered:', accountName);
        return;
      }

      // Add new account
      const newAccount: StoredAccount = {
        accountName,
        addedAt: new Date().toISOString()
      };

      const updatedAccounts = [...accounts, newAccount];
      localStorage.setItem('innopay_accounts', JSON.stringify(updatedAccounts));
      setStoredAccounts(updatedAccounts);

      console.log('[TOPUP PAGE] Account registered:', accountName);
    } catch (e) {
      console.error('Error writing to localStorage:', e);
    }
  };

  // Handler: Select account from dialog
  const handleSelectAccount = (accountName: string) => {
    setSelectedAccount(accountName);
    setShowAccountDialog(false);
  };

  // Handler: Create new account (redirect to /user)
  const handleCreateNewAccount = () => {
    window.location.href = '/user';
  };

  // Handler: Top-up button
  const handleTopUp = async () => {
    if (!selectedAccount) {
      setError('No account selected');
      return;
    }

    setError('');
    setLoading(true);

    try {
      console.log('[TOPUP PAGE] Starting top-up checkout for:', selectedAccount);
      console.log('[TOPUP PAGE] Amount:', topupAmount);

      // Enforce minimum (15 EUR)
      const finalAmount = Math.max(topupAmount, 15);

      // Store return info in sessionStorage (survives Stripe redirect)
      if (returnToIndiesmenu && indiesTable) {
        sessionStorage.setItem('innopay_return_to_indiesmenu', 'true');
        sessionStorage.setItem('innopay_indies_table', indiesTable);
      }

      // Retrieve pending order info (if exists)
      const orderAmount = sessionStorage.getItem('innopay_pending_order_amount');
      const orderMemo = sessionStorage.getItem('innopay_pending_order_memo');

      // Fetch user email for Stripe pre-fill
      let userEmail: string | undefined;
      try {
        const emailResponse = await fetch(`/api/account/email?accountName=${selectedAccount}`);
        if (emailResponse.ok) {
          const emailData = await emailResponse.json();
          userEmail = emailData.email;
          console.log('[TOPUP PAGE] Retrieved user email for Stripe pre-fill');
        }
      } catch (e) {
        console.log('[TOPUP PAGE] Could not retrieve user email:', e);
      }

      // Build checkout request
      const checkoutBody: any = {
        flow: 'topup',
        accountName: selectedAccount,
        amount: finalAmount,
      };

      // Add email if found
      if (userEmail) {
        checkoutBody.email = userEmail;
      }

      // Add order info if pending order exists
      if (orderAmount && orderMemo) {
        checkoutBody.orderAmountEuro = orderAmount;
        checkoutBody.orderMemo = orderMemo;
        console.log('[TOPUP PAGE] Including pending order in topup:', { orderAmount, memoLength: orderMemo.length });
      }

      // Create checkout session with flow='topup'
      const response = await fetch('/api/checkout/account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(checkoutBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create checkout session');
      }

      const data = await response.json();
      console.log('[TOPUP PAGE] Checkout session created:', data.sessionId);

      // Redirect to Stripe checkout
      window.location.href = data.url;

    } catch (err: any) {
      console.error('[TOPUP PAGE] Error:', err);
      setError(err.message || 'An unexpected error occurred');
      setLoading(false);
    }
  };

  // Render: Account selection dialog
  const renderAccountDialog = () => {
    if (!showAccountDialog) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
          <h2 className="text-2xl font-bold text-blue-900 mb-4">
            {storedAccounts.length === 1 ? 'Welcome back!' : 'Select Account'}
          </h2>

          {storedAccounts.length === 1 ? (
            <p className="text-gray-700 mb-6">
              Top up your account <span className="font-bold text-blue-700">{storedAccounts[0].accountName}</span>?
            </p>
          ) : (
            <p className="text-gray-700 mb-4">
              Which account would you like to top up?
            </p>
          )}

          <div className="space-y-3 mb-4">
            {storedAccounts.map((account) => (
              <button
                key={account.accountName}
                onClick={() => handleSelectAccount(account.accountName)}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200"
              >
                {account.accountName}
              </button>
            ))}
          </div>

          <button
            onClick={handleCreateNewAccount}
            className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 px-4 rounded-lg transition duration-200"
          >
            Create New Account
          </button>
        </div>
      </div>
    );
  };

  // Render: Top-up form
  const renderTopUpForm = () => {
    if (!selectedAccount) return null;

    return (
      <div className="flex flex-col items-center space-y-6 p-6 sm:p-8 bg-white rounded-xl shadow-lg w-full max-w-md">
        {/* Header with logo */}
        <div className="flex flex-col items-center mb-4 p-4 bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-500 rounded-lg shadow-lg w-full text-center">
          <div className="relative w-[80%] h-auto aspect-video">
            <Image
              src={innopayLogoUrl}
              alt="Innopay Logo"
              fill
              className="object-contain"
              priority={true}
            />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-blue-900 mt-4">
            Top-up Your Wallet
          </h1>
        </div>

        {/* Account info */}
        <div className="w-full p-4 bg-blue-50 border-2 border-blue-300 rounded-lg">
          <p className="text-sm text-gray-600 mb-1">Account</p>
          <p className="text-xl font-bold text-blue-900">{selectedAccount}</p>
        </div>

        {/* Amount input */}
        <div className="w-full">
          <label htmlFor="topupAmount" className="block text-sm font-semibold text-gray-700 mb-2">
            Top-up Amount (EUR)
          </label>
          <input
            id="topupAmount"
            type="number"
            min={15}
            step="0.01"
            value={topupAmount}
            onChange={(e) => {
              const value = e.target.value === '' ? 15 : parseFloat(e.target.value);
              if (!isNaN(value)) {
                setTopupAmount(value);
              }
            }}
            onBlur={(e) => {
              // Validate when user leaves the field
              const value = parseFloat(e.target.value);
              if (isNaN(value) || value < 15) {
                setTopupAmount(15);
              }
            }}
            className="w-full p-4 border-2 border-blue-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg font-semibold"
          />
          <p className="mt-2 text-sm text-gray-600">
            Minimum: 15 EUR
          </p>
        </div>

        {/* Top-up button */}
        <button
          onClick={handleTopUp}
          disabled={loading}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 px-6 rounded-lg transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Processing...' : `Top-up ${topupAmount} EUR`}
        </button>

        {/* Change account button */}
        <button
          onClick={() => {
            setSelectedAccount(null);
            setShowAccountDialog(true);
          }}
          className="text-sm text-blue-600 hover:text-blue-800 underline"
        >
          Change Account
        </button>

        {error && (
          <div className="w-full p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            <p className="font-bold">Error:</p>
            <p>{error}</p>
          </div>
        )}
      </div>
    );
  };

  // Render: No account (create new)
  const renderNoAccount = () => {
    return (
      <div className="flex flex-col items-center space-y-6 p-6 sm:p-8 bg-white rounded-xl shadow-lg w-full max-w-md">
        {/* Header with logo */}
        <div className="flex flex-col items-center mb-4 p-4 bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-500 rounded-lg shadow-lg w-full text-center">
          <div className="relative w-[80%] h-auto aspect-video">
            <Image
              src={innopayLogoUrl}
              alt="Innopay Logo"
              fill
              className="object-contain"
              priority={true}
            />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-blue-900 mt-4">
            Welcome to Innopay
          </h1>
        </div>

        <p className="text-lg text-gray-700 text-center">
          You don't have an Innopay account yet.
        </p>

        <button
          onClick={handleCreateNewAccount}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 px-6 rounded-lg transition duration-300"
        >
          Create Account
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      {/* Success banner */}
      {showSuccess && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50">
          ✓ Top-up successful! Your wallet has been credited.
        </div>
      )}

      {/* Cancelled banner */}
      {showCancelled && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-yellow-500 text-white px-6 py-3 rounded-lg shadow-lg z-50">
          Payment cancelled. No charges were made.
        </div>
      )}

      {/* Account selection dialog */}
      {renderAccountDialog()}

      {/* Main content */}
      {selectedAccount ? renderTopUpForm() : storedAccounts.length === 0 ? renderNoAccount() : null}
    </div>
  );
}
