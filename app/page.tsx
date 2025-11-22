'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';

const innopayLogoUrl = "/innopay.svg";

// Translations for the UI
const translations = {
  fr: {
    title: "Bienvenue sur Innopay",
    amountLabel: "Montant (EUR)",
    createAndTopUp: "Créer et Recharger",
    topUpWallet: "Recharger Votre Portefeuille",
    minAmount: "Montant minimum: 15€",
    maxAmount: "Montant maximum: 999€"
  },
  en: {
    title: "Welcome to Innopay",
    amountLabel: "Amount (EUR)",
    createAndTopUp: "Create and Top Up",
    topUpWallet: "Top Up Your Wallet",
    minAmount: "Minimum amount: 15€",
    maxAmount: "Maximum amount: 999€"
  },
  de: {
    title: "Willkommen bei Innopay",
    amountLabel: "Betrag (EUR)",
    createAndTopUp: "Erstellen und Aufladen",
    topUpWallet: "Brieftasche Aufladen",
    minAmount: "Mindestbetrag: 15€",
    maxAmount: "Höchstbetrag: 999€"
  },
  lb: {
    title: "Wëllkomm bei Innopay",
    amountLabel: "Betrag (EUR)",
    createAndTopUp: "Erstellen an Oplueden",
    topUpWallet: "Äre Portemonnaie Oplueden",
    minAmount: "Mindestbetrag: 15€",
    maxAmount: "Maximal Betrag: 999€"
  }
};

type Language = 'fr' | 'en' | 'de' | 'lb';

function TopUpContent() {
  const searchParams = useSearchParams();

  const [amount, setAmount] = useState(100);
  const [language, setLanguage] = useState<Language>('fr');
  const [hasAccount, setHasAccount] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const t = translations[language];

  // Check if user has an account in localStorage
  useEffect(() => {
    const accountName = localStorage.getItem('innopay_accountName') || localStorage.getItem('innopayAccountName');
    setHasAccount(!!accountName);
  }, []);

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
      const flow = hasAccount ? 'topup' : 'account_creation';

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

      const response = await fetch('/api/checkout/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          flow,
          accountName: hasAccount ? accountName : undefined,
          email: userEmail
        })
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
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-4xl font-bold text-center"
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
