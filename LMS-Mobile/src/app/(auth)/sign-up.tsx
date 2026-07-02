import { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/utils/apiError';

export default function SignUpScreen() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async () => {
    if (submitting) return;
    if (!name.trim() || !email.trim()) {
      setError('Please enter your name and email.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await register(name, email, password);
      router.replace('/');
    } catch (err) {
      setError(getErrorMessage(err) || 'Could not create your account. Try a different email.');
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
            <Text className="text-2xl font-extrabold text-primary-dark">Create your account</Text>
            <Text className="mt-1 text-sm text-neutral-500">Join the SM Web Systems LMS</Text>
          </View>

          <View className="gap-4">
            <Input label="Full name" value={name} onChangeText={setName} placeholder="Jane Doe" />
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              secureTextEntry
              autoCapitalize="none"
            />
            {error ? <Text className="text-sm text-red-500">{error}</Text> : null}
            <Button label="Create account" onPress={onSubmit} loading={submitting} size="lg" />
          </View>

          <View className="mt-6 flex-row justify-center gap-1">
            <Text className="text-sm text-neutral-500">Already have an account?</Text>
            <Link href="/(auth)/sign-in" className="text-sm font-semibold text-accent-teal">
              Sign in
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
