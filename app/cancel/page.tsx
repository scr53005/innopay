// pages/cancel.tsx (or app/cancel/page.tsx)
import React from 'react';
import Link from 'next/link';

const CancelPage = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-red-50 p-4">
      <h1 className="text-4xl font-bold text-red-700 mb-4">Payment Cancelled</h1>
      <p className="text-lg text-gray-700 mb-8 text-center">Your payment was not completed. Please try again if you wish to top-up your wallet.</p>
      <Link href="/">
        <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-300 ease-in-out">
          Go to Home
        </button>
      </Link>
    </div>
  );
};

export default CancelPage;