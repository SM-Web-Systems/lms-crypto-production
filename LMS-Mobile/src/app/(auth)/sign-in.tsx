import { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/utils/apiError';
import { WalletSignInCancelled } from '@/services/ammaWalletService';
import { openWebDashboard } from '@/utils/webHandoff';

export default function SignInScreen() {
  const { login, loginWithAmma, sessionNotice } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showInternal,setShowInternal] = useState(false);
  const [walletBusy,setWalletBusy] = useState(false);

  const signInWithWallet = async () => {
    if (walletBusy || submitting) return;
    setWalletBusy(true); setError('');
    try {
      if (Platform.OS === 'web') await openWebDashboard('/login');
      else { await loginWithAmma(); router.replace('/'); }
    } catch (error) {
      if (!(error instanceof WalletSignInCancelled)) setError(getErrorMessage(error,'Could not sign in with AmmaWallet. Please try again.'));
    } finally { setWalletBusy(false); }
  };

  const onSubmit = async () => {
    if (submitting || walletBusy) return;
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await login(email, password);
      router.replace('/');
    } catch (err) {
      setError(getErrorMessage(err) || 'Could not sign you in. Check your details and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1">
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-6 py-10"
          keyboardShouldPersistTaps="handled">
          <View className="mb-8 items-center">
            <View className="mb-4 h-16 w-16 items-center justify-center rounded-2xl bg-primary-dark">
              <Text className="text-2xl font-extrabold text-white">SM</Text>
            </View>
            <Text className="text-2xl font-extrabold text-primary-dark">SM Web Systems</Text>
            <Text className="mt-1 text-sm text-neutral-500">Learning Management</Text>
          </View>

          <View className="gap-4">
            {sessionNotice && sessionNotice !== error ? <Text accessibilityRole="alert" className="text-amber-800">{sessionNotice}</Text> : null}
            <Text className="text-neutral-600">Sign in with your AmmaWallet account to continue.</Text>
            <Button label="Sign in with AmmaWallet" onPress={signInWithWallet} loading={walletBusy} disabled={submitting} size="lg"/>
            {Platform.OS === 'web' ? <Text className="text-sm text-neutral-500">Opens the LMS web dashboard in your browser.</Text> : null}
            <Link href="/(auth)/forgot-password" className="text-sm font-semibold text-accent-teal">Recover your AmmaWallet account</Link>
            {error ? <Text accessibilityRole="alert" className="text-sm text-red-500">{error}</Text> : null}
            <Button label="Administrator / internal sign in" variant="ghost" onPress={()=>setShowInternal(value=>!value)}
              disabled={walletBusy || submitting} accessibilityState={{expanded:showInternal}}/>
            {showInternal ? <View className="gap-4">
            <Text className="text-sm text-neutral-500">For existing LMS internal accounts. AmmaWallet accounts use the button above.</Text>
            <Input
              label="Email"
              accessibilityLabel="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
            />
            <Input
              label="Password"
              accessibilityLabel="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              secureTextEntry
              autoCapitalize="none"
              textContentType="password"
            />

            <Link href="/(auth)/internal-forgot-password" className="text-sm font-semibold text-accent-teal">Forgot internal account password?</Link>
            <Button label="Sign in to internal account" onPress={onSubmit} loading={submitting} size="lg" />
            </View> : null}
          </View>

          <View className="mt-6 flex-row justify-center gap-1">
            <Text className="text-sm text-neutral-500">New here?</Text>
            <Link href="/(auth)/sign-up" className="text-sm font-semibold text-accent-teal">
              Create AmmaWallet account
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
