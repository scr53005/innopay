'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function GuestSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('Processing your payment...');

  useEffect(() => {
    if (!sessionId) {
      setError('No session ID provided');
      setLoading(false);
      return;
    }

    // Poll for completion (webhook might still be processing)
    const checkStatus = async () => {
      try {
        // In production, you might want to check the database or call an API
        // For now, we just show success after a delay
        setTimeout(() => {
          setMessage('Payment successful! Your order has been placed.');
          setLoading(false);

          // Redirect back to indiesmenu if opened from there
          if (window.opener) {
            window.opener.postMessage({
              type: 'INNOPAY_GUEST_PAYMENT_SUCCESS',
              sessionId
            }, 'https://innopay.lu');

            setTimeout(() => {
              window.close();
            }, 3000);
          }
        }, 2000);
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    };

    checkStatus();
  }, [sessionId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {loading ? 'Processing Payment...' : error ? 'Payment Error' : 'Payment Successful'}
          </h2>
        </div>

        {loading && (
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        )}

        {error && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{error}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {!loading && !error && (
          <div className="rounded-md bg-green-50 p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800">Success!</h3>
                <div className="mt-2 text-sm text-green-700">
                  <p>{message}</p>
                  {window.opener && (
                    <p className="mt-2">Redirecting back to restaurant...</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {!loading && !window.opener && (
          <div className="text-center">
            <a
              href="/"
              className="text-blue-600 hover:text-blue-500 font-medium"
            >
              Return to Homepage
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default function GuestSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    }>
      <GuestSuccessContent />
    </Suspense>
  );
}
