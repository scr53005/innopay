// pages/success.tsx (or app/success/page.tsx)
import React from 'react';
import Link from 'next/link';

const SuccessPage = () => {
  // You could optionally fetch the session details here using the session_id from URL params
  // const router = useRouter();
  // const { session_id } = router.query;
  // if (session_id) { /* fetch session details */ }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-green-50 p-4">
      <h1 className="text-4xl font-bold text-green-700 mb-4">Payment Successful! 🎉</h1>
      <p className="text-lg text-gray-700 mb-8 text-center">Your wallet has been topped up. Thank you for your support!</p>
      <Link href="/">
        <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-300 ease-in-out">
          Go to Home
        </button>
      </Link>
    </div>
  );
};

export default SuccessPage;