import { useContext, type ReactNode } from 'react';
import { ScrollView,View,Text } from 'react-native';
import { SafeAreaView, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { LoadingView } from './LoadingView';
import { ErrorBanner } from './ErrorBanner';
import { Button } from './ui/Button';
import { OfflineLearningPanel } from './OfflineLearningPanel';

export function SessionBoundary({children}:{children:ReactNode}) {
  const {user,isLoading,sessionError,storageWarning,refresh,logout}=useAuth();
  const insets=useContext(SafeAreaInsetsContext);
  if(isLoading) return <LoadingView message="Restoring your session…"/>;
  if(sessionError && !user) return <SafeAreaView style={{flex:1}}><ScrollView className="bg-neutral-50" contentContainerClassName="p-6 gap-4">
    <Text className="text-xl font-bold text-neutral-900">Reconnect to your account</Text>
    <Text>Your saved session is being kept. Reconnect to verify your access and continue.</Text>
    <ErrorBanner message={sessionError} onRetry={()=>{void refresh();}}/>
    <OfflineLearningPanel />
    <Button label="Sign out" variant="outline" onPress={()=>{void logout();}}/>
  </ScrollView></SafeAreaView>;
  const notices = sessionError || storageWarning;
  return <View className="flex-1">
    {/* These notices sit above the screen header, so they must clear the status bar themselves. */}
    {notices ? <SafeAreaView edges={['top']} testID="session-notices">
      {sessionError ? <ErrorBanner message={sessionError} onRetry={()=>{void refresh();}}/> : null}
      {storageWarning ? <Text accessibilityRole="alert" className="bg-amber-50 p-3 text-amber-900">{storageWarning}</Text> : null}
      {storageWarning && !user ? <Button label="Retry clearing saved session" variant="outline" onPress={()=>{void logout();}}/> : null}
    </SafeAreaView> : null}
    {/* The notices already cleared the status bar; stop screen headers adding the same inset again. */}
    {notices && insets ? <SafeAreaInsetsContext.Provider value={{...insets, top: 0}}>{children}</SafeAreaInsetsContext.Provider> : children}
  </View>;
}
