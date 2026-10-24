import type { ReactNode } from 'react';
import { View,Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { LoadingView } from './LoadingView';
import { ErrorBanner } from './ErrorBanner';
import { Button } from './ui/Button';

export function SessionBoundary({children}:{children:ReactNode}) {
  const {user,isLoading,sessionError,storageWarning,refresh,logout}=useAuth();
  if(isLoading) return <LoadingView message="Restoring your session…"/>;
  if(sessionError && !user) return <SafeAreaView style={{flex:1}}><View className="flex-1 justify-center bg-neutral-50 p-6 gap-4">
    <Text className="text-xl font-bold text-neutral-900">Reconnect to your account</Text>
    <Text>Your saved session is being kept. Reconnect to verify your access and continue.</Text>
    <ErrorBanner message={sessionError} onRetry={()=>{void refresh();}}/>
    <Button label="Sign out" variant="outline" onPress={()=>{void logout();}}/>
  </View></SafeAreaView>;
  return <View className="flex-1">
    {sessionError ? <ErrorBanner message={sessionError} onRetry={()=>{void refresh();}}/> : null}
    {storageWarning ? <Text accessibilityRole="alert" className="bg-amber-50 p-3 text-amber-900">{storageWarning}</Text> : null}
    {storageWarning && !user ? <Button label="Retry clearing saved session" variant="outline" onPress={()=>{void logout();}}/> : null}
    {children}
  </View>;
}
