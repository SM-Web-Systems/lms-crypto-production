import {useState} from 'react';
import {ScrollView,Text,KeyboardAvoidingView,Platform} from 'react-native';
import {Link,useLocalSearchParams} from 'expo-router';
import {Screen} from '@/components/ui/Screen';
import {Input} from '@/components/ui/Input';
import {Button} from '@/components/ui/Button';
import {ErrorBanner} from '@/components/ErrorBanner';
import {authService} from '@/services/authService';
import {useAuth} from '@/context/AuthContext';
import {getErrorMessage} from '@/utils/apiError';

export default function ResetPasswordScreen(){
  const params=useLocalSearchParams<{token?:string|string[]}>();
  const {logout}=useAuth();
  const [link,setLink]=useState(typeof params.token==='string'?params.token:'');
  const [password,setPassword]=useState('');
  const [confirmation,setConfirmation]=useState('');
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const submit=async()=>{
    if(busy)return;
    let token=link.trim();
    if(/^https?:\/\//i.test(token)){try{token=new URL(token).searchParams.get('token')||'';}catch{token='';}}
    if(!token){setError('Paste a valid reset link or token from your email.');return;}
    if(password.length<8){setError('Password must be at least 8 characters.');return;}
    if(password!==confirmation){setError('Passwords do not match.');return;}
    setBusy(true);setError(null);
    try{
      await authService.resetPassword(token,password);
      await logout(); // Password reset invalidates existing sessions; require a fresh sign-in.
      setDone(true);setLink('');setPassword('');setConfirmation('');
    }catch(error){setError(getErrorMessage(error,'Could not reset your password. Request a new link if it has expired.'));}
    finally{setBusy(false);}
  };
  return <Screen edges={['top','bottom']}><KeyboardAvoidingView className="flex-1" behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView contentContainerClassName="flex-grow justify-center p-6 gap-4" keyboardShouldPersistTaps="handled">
    <Text className="text-2xl font-bold text-neutral-900">Choose a new password</Text>
    {done ? <Text accessibilityLiveRegion="polite">Password updated. Sign in with your new password.</Text> : <>
      <Input label="Reset link or token" accessibilityLabel="Reset link or token" value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false} secureTextEntry/>
      <Input label="New password" accessibilityLabel="New password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" textContentType="newPassword"/>
      <Input label="Confirm new password" accessibilityLabel="Confirm new password" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" textContentType="newPassword"/>
      <Button label={busy?'Updating…':'Update password'} onPress={submit} disabled={busy}/>
      <Link href="/(auth)/forgot-password" className="font-semibold text-accent-teal">Request a new reset link</Link>
    </>}
    {error ? <ErrorBanner message={error}/> : null}
    <Link href="/(auth)/sign-in" className="font-semibold text-accent-teal">Back to sign in</Link>
  </ScrollView></KeyboardAvoidingView></Screen>;
}
