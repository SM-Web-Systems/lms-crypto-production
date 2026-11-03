import { Link } from 'expo-router';
import { WalletAccountScreen } from '@/components/WalletAccountScreen';

export default function ForgotPasswordScreen() {
  return <WalletAccountScreen action="recover" title="Recover your account"
    description="AmmaWallet manages your password. Recover your account there, then return here and sign in with AmmaWallet."
    label="Recover AmmaWallet account">
    <Link href="/(auth)/internal-forgot-password" className="text-sm font-semibold text-accent-teal">Recover an LMS internal account</Link>
  </WalletAccountScreen>;
}
