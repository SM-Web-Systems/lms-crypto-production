import { ScrollView, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { workspacesFor, workspaceLabels, workspacePaths, canStudy } from '@/utils/authorization';
import { Button } from '@/components/ui/Button';
import { WebHandoffButton } from '@/components/WebHandoffButton';
import { LoadingView } from '@/components/LoadingView';

export default function WorkspaceScreen() {
  const {user,isLoading,logout,refresh}=useAuth();
  const router=useRouter();
  if(isLoading) return <LoadingView/>;
  if(!user) return <Redirect href="/(auth)/sign-in"/>;
  if(user.deletionStatus==='pending_deletion') return <Redirect href="/account"/>;
  const workspaces=workspacesFor(user);
  return <SafeAreaView style={{flex:1,backgroundColor:'#f8fafb'}}><ScrollView contentContainerClassName="p-5 gap-4 pb-8">
    <Text className="text-2xl font-bold text-neutral-900">Your workspaces</Text>
    <Text>{user.email}</Text>
    <Text>The app supports student learning. Teaching, sponsorship, and other workspaces are available on the web dashboard.</Text>
    {canStudy(user) ? <Button label="Continue student learning" onPress={()=>router.replace('/(student)/dashboard')}/> : null}
    {workspaces.filter(workspace=>workspace!=='student').map(workspace=><View key={workspace} className="rounded-xl border border-neutral-200 bg-white p-4 gap-2">
      <Text className="font-bold">{workspaceLabels[workspace]}</Text>
      <WebHandoffButton path={workspacePaths[workspace]} label={`Open ${workspaceLabels[workspace].toLowerCase()} on web`}/>
    </View>)}
    {!workspaces.length ? <Text accessibilityRole="alert">No workspace is currently assigned. Contact your administrator, then refresh your access.</Text> : null}
    <Button label="Refresh access" variant="outline" onPress={()=>{void refresh();}}/>
    <Button label="Account and security" variant="outline" onPress={()=>router.push('/account')}/>
    <Button label="Sign out" variant="outline" onPress={()=>{void logout();}}/>
  </ScrollView></SafeAreaView>;
}
