import { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/utils/apiError';

export default function SignInScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async () => {
    if (submitting) return;
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
            <Input
              label="Email"
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
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              secureTextEntry
              autoCapitalize="none"
              textContentType="password"
            />

            {error ? <Text className="text-sm text-red-500">{error}</Text> : null}

            <Button label="Sign in" onPress={onSubmit} loading={submitting} size="lg" />
          </View>

          <View className="mt-6 flex-row justify-center gap-1">
            <Text className="text-sm text-neutral-500">New here?</Text>
            <Link href="/(auth)/sign-up" className="text-sm font-semibold text-accent-teal">
              Create an account
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
