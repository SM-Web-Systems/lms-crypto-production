import { useState } from 'react';
import { View, Text } from 'react-native';
import { openWebDashboard } from '../utils/webHandoff';
import { getErrorMessage } from '../utils/apiError';
import { Button } from './ui/Button';
import { ErrorBanner } from './ErrorBanner';

export function WebHandoffButton({path,label}: {path:string;label:string}) {
  const [error,setError]=useState<string|null>(null);
  return <View className="gap-2">
    <Button label={label} variant="outline" onPress={async()=>{
      setError(null);
      try { await openWebDashboard(path); } catch(error) { setError(getErrorMessage(error,'Could not open the web dashboard. Please try again.')); }
    }}/>
    <Text className="text-xs text-neutral-500">Opens your browser. Sign in there with the same account.</Text>
    {error ? <ErrorBanner message={error}/> : null}
  </View>;
}
