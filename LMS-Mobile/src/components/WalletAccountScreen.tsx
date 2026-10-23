import { useState, type ReactNode } from 'react';
import { Text, ScrollView } from 'react-native';
import { Link } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ErrorBanner';
import { openWalletAccount } from '@/services/ammaWalletService';
import { getErrorMessage } from '@/utils/apiError';

export function WalletAccountScreen({action,title,description,label,children}: {
  action:'register'|'recover'; title:string; description:string; label:string; children?:ReactNode;
}) {
  const [error,setError] = useState<string|null>(null);
  const [busy,setBusy] = useState(false);
  const open = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await openWalletAccount(action); }
    catch (error) { setError(getErrorMessage(error,'Could not open AmmaWallet. Please try again.')); }
    finally { setBusy(false); }
  };
  return <Screen edges={['top','bottom']}><ScrollView contentContainerClassName="flex-grow justify-center p-6 gap-5">
    <Text className="text-2xl font-bold text-neutral-900">{title}</Text>
    <Text className="text-neutral-600">{description}</Text>
    <Button label={label} loading={busy} onPress={open}/>
    {error ? <ErrorBanner message={error}/> : null}
    <Link href="/(auth)/sign-in" className="font-semibold text-accent-teal">Back to sign in</Link>
    {children}
  </ScrollView></Screen>;
}
