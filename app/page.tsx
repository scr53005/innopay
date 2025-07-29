'use client';
import React, { useState, createContext, useContext, ReactNode } from 'react';

// Define a type for the supported locales
type Locale = 'en' | 'fr' | 'de' | 'lb';

// Translations object for the button text
const translations: Record<Locale, string> = { // Explicitly type translations object
  en: "Create / Top-up your wallet",
  fr: "Créez / Alimentez votre portefeuille",
  de: "Wallet erstellen / aufladen", // German translation
  lb: "Portemonnaie erstellen / oplueden" // Luxembourgish translation
};

// Create a context for the locale with a default value
// The default value should match the shape of the context value provided by the provider.
// This helps with type inference and provides a fallback if the context is used outside a provider.
// By referencing the 'translations' object directly, TypeScript knows its structure.
const LocaleContext = createContext({
  locale: 'en' as Locale, // Default locale, explicitly typed
  changeLocale: (newLocale: Locale) => {}, // Placeholder function with explicit type
  translations: translations // Use the actual translations object here
});

// Define the props interface for LocaleProvider
interface LocaleProviderProps {
  children: ReactNode; // Explicitly type children as ReactNode
}

// Locale Provider component
const LocaleProvider = ({ children }: LocaleProviderProps) => {
  // State to hold the current locale, defaulting to English
  const [locale, setLocale] = useState<Locale>('en'); // State with explicit type

  // Function to change the locale
  const changeLocale = (newLocale: Locale) => { // Explicitly type newLocale
    setLocale(newLocale);
  };

  return (
    <LocaleContext.Provider value={{ locale, changeLocale, translations }}>
      {children}
    </LocaleContext.Provider>
  );
};

// Main App component
const App = () => {
  // Consume the locale context
  const { locale, changeLocale, translations } = useContext(LocaleContext);

  // Function to handle button click and redirect
  const handleButtonClick = () => {
    window.open("https://donate.stripe.com/3cIdR81Zsg3Hay7cG13cc01", "_blank");
  };

  // Placeholder for the Innopay SVG.
  // In a real Next.js app, you would place 'innopay.svg' in your 'public' directory
  // and reference it as '/innopay.svg'.
  // For this example, we'll use a placeholder image URL.
  const innopayLogoUrl = "/innopay.svg";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4 font-sans">
      <div className="flex flex-col items-center space-y-8 p-8 bg-white rounded-xl shadow-lg w-full max-w-md">
        {/* Innopay Logo */}
        <img
          src={innopayLogoUrl}
          alt="Innopay Logo"
          className="w-144 h-auto rounded-lg" // Adjusted size and rounded corners
          // For actual SVG, you'd use:
          // <img src="/innopay.svg" alt="Innopay Logo" className="w-48 h-auto rounded-lg" />
        />

        {/* Input Field */}
        <input
          type="text"
          defaultValue="100€"
          className="w-full p-3 text-center text-2xl font-bold border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200 ease-in-out"
        />

        {/* Button */}
        <button
          onClick={handleButtonClick}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
        >
          {translations[locale]}
        </button>

        {/* Language Selector */}
        <div className="flex space-x-2 mt-4">
          {Object.keys(translations).map((lang) => (
            <button
              key={lang}
              onClick={() => changeLocale(lang as Locale)} // Cast lang to Locale for the onClick handler
              className={`px-3 py-1 rounded-md text-sm font-medium ${
                locale === lang
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              } transition duration-200 ease-in-out`}
            >
              {lang.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// Wrap the App component with the LocaleProvider to make the context available
export default function WrappedApp() {
  return (
    <LocaleProvider>
      <App />
    </LocaleProvider>
  );
}
