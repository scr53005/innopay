'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

type HafAccount = {
  name: string;
  hbd: string;
  hbd_savs: string;
  account_auths: any;
};

const innopayLogoUrl = "/innopay.svg";

export default function BooksPage() {
  const [accounts, setAccounts] = useState<HafAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchAccounts() {
      try {
        setLoading(true);
        setError('');

        const response = await fetch('/api/haf-accounts');

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch accounts');
        }

        const data = await response.json();
        setAccounts(data.accounts || []);
      } catch (err) {
        console.error('Error fetching HAF accounts:', err);
        setError(err instanceof Error ? err.message : 'Failed to load accounts');
      } finally {
        setLoading(false);
      }
    }

    fetchAccounts();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Image
            src={innopayLogoUrl}
            alt="Innopay Logo"
            width={60}
            height={60}
            className="rounded-lg shadow-md"
          />
          <div>
            <h1 className="text-4xl font-bold text-gray-800">Innopay Books</h1>
            <p className="text-gray-600 mt-1">
              Accounts with Innopay as active authority
            </p>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading accounts from HAF database...</p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h3 className="text-red-800 font-semibold mb-2">Error</h3>
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* Results Table */}
        {!loading && !error && accounts.length > 0 && (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600">
              <h2 className="text-xl font-semibold text-white">
                Found {accounts.length} account{accounts.length !== 1 ? 's' : ''}
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Account Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      HBD Balance
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      HBD Savings
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Account Authorities
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {accounts.map((account, index) => (
                    <tr
                      key={account.name}
                      className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <a
                          href={`https://hive.blog/@${account.name}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          @{account.name}
                        </a>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-700">
                        {parseFloat(account.hbd).toFixed(3)} HBD
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-700">
                        {parseFloat(account.hbd_savs).toFixed(3)} HBD
                      </td>
                      <td className="px-6 py-4 text-gray-600 text-sm font-mono">
                        {JSON.stringify(account.account_auths)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* No Results */}
        {!loading && !error && accounts.length === 0 && (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <p className="text-gray-600">No accounts found with Innopay authority.</p>
          </div>
        )}
      </div>
    </div>
  );
}
