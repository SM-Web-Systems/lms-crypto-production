import { WalletAccountScreen } from '@/components/WalletAccountScreen';

export default function SignUpScreen() {
  return <WalletAccountScreen action="register" title="Create your AmmaWallet account"
    description="Your AmmaWallet account gives you access to the LMS. Create it in your browser, then return here and sign in with AmmaWallet."
    label="Create AmmaWallet account"/>;
}
