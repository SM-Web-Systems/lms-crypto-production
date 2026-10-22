import {useState} from 'react';
import {ScrollView,Text,View,KeyboardAvoidingView,Platform} from 'react-native';
import {Link} from 'expo-router';
import {Screen} from '@/components/ui/Screen';
import {Input} from '@/components/ui/Input';
import {Button} from '@/components/ui/Button';
import {ErrorBanner} from '@/components/ErrorBanner';
import {authService} from '@/services/authService';
import {getErrorMessage} from '@/utils/apiError';

export default function ForgotPasswordScreen(){
  const [email,setEmail]=useState('');
  const [busy,setBusy]=useState(false);
  const [sent,setSent]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const submit=async()=>{
    if(busy)return;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())){setError('Enter a valid email address.');return;}
    setBusy(true);setError(null);
    try{await authService.forgotPassword(email);setSent(true);}catch(error){setError(getErrorMessage(error,'Could not request a reset. Please try again.'));}
    finally{setBusy(false);}
  };
  return <Screen edges={['top','bottom']}><KeyboardAvoidingView className="flex-1" behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView contentContainerClassName="flex-grow justify-center p-6 gap-4" keyboardShouldPersistTaps="handled">
    <Text className="text-2xl font-bold text-neutral-900">Reset your password</Text>
    {sent ? <View className="gap-3">
      <Text accessibilityLiveRegion="polite">If that email matches an account, a reset link will be sent. Check your inbox and spam folder.</Text>
      <Text>Open the email link to reset on the web, or use the reset link in this app.</Text>
      <Link href="/(auth)/reset-password" className="font-semibold text-accent-teal">Use a reset link in this app</Link>
      <Button label="Use a different email" variant="outline" onPress={()=>{setSent(false);setError(null);}}/>
    </View> : <>
      <Text>Enter your account email to request a password reset link.</Text>
      <Input label="Email" accessibilityLabel="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email"/>
      <Button label={busy?'Sending…':'Send reset link'} onPress={submit} disabled={busy}/>
    </>}
    {error ? <ErrorBanner message={error}/> : null}
    <Link href="/(auth)/sign-in" className="font-semibold text-accent-teal">Back to sign in</Link>
  </ScrollView></KeyboardAvoidingView></Screen>;
}
