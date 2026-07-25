import React from 'react';
import { Wallet, ArrowRight } from 'lucide-react';

const AMMA_WALLET_URL = 'https://ammawallet.com';
const AMMA_REGISTER_URL = `${AMMA_WALLET_URL}/register?source=lms`;

/**
 * LMS Sign Up — accounts are created on AmmaWallet and then used to
 * access the LMS via SSO.  This page redirects users to AmmaWallet.
 */
const SignUp: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-dark to-primary-medium flex items-center justify-center px-4 py-10">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="SM Web Systems" className="w-20 h-20 mx-auto mb-4" />
          <h1 className="text-4xl font-bold text-white mb-2">SM Web Systems</h1>
          <p className="text-white/80">Learning Management System</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6 text-center">
          <div className="space-y-2">
            <div className="flex justify-center">
              <div className="bg-primary-50 rounded-full p-4">
                <Wallet className="h-8 w-8 text-primary-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Create your account</h2>
            <p className="text-gray-500 text-sm">
              LMS accounts are linked to AmmaWallet. Create your AmmaWallet account
              first, then sign in here using AmmaWallet.
            </p>
          </div>

          <div className="space-y-3">
            <a
              href={AMMA_REGISTER_URL}
              className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              <Wallet className="h-5 w-5" />
              Create AmmaWallet account
              <ArrowRight className="h-4 w-4" />
            </a>

            <a
              href="/api/v1/auth/amma-login"
              className="w-full flex items-center justify-center gap-2 border border-gray-300 hover:border-primary-400 hover:bg-primary-50 text-gray-700 font-semibold py-2.5 rounded-lg transition-colors"
            >
              Already have AmmaWallet? Sign in
            </a>
          </div>

          <p className="text-xs text-gray-400">
            After creating your AmmaWallet account, return here and click
            &ldquo;Sign in with AmmaWallet&rdquo; to access the LMS.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignUp;
