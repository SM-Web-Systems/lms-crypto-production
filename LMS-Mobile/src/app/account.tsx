import {useCallback,useEffect,useState} from 'react';
import {ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Redirect,useRouter} from 'expo-router';
import {useAuth} from '@/context/AuthContext';
import {accountService,type AccountSession,type DataExport,type DeletionStatus} from '@/services/accountService';
import {mobileHome} from '@/utils/authorization';
import {getErrorMessage} from '@/utils/apiError';
import {Button} from '@/components/ui/Button';
import {Input} from '@/components/ui/Input';
import {Card,CardTitle} from '@/components/ui/Card';
import {ErrorBanner} from '@/components/ErrorBanner';
import {LoadingView} from '@/components/LoadingView';

export default function AccountScreen(){
  const {user,isLoading,logout,refresh}=useAuth();
  const router=useRouter();
  const [sessions,setSessions]=useState<AccountSession[]|null>(null);
  const [exports,setExports]=useState<DataExport[]|null>(null);
  const [deletion,setDeletion]=useState<DeletionStatus|null>(null);
  const [errors,setErrors]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState<string|null>(null);
  const [confirmation,setConfirmation]=useState('');
  const [revokeId,setRevokeId]=useState<string|null>(null);
  const [message,setMessage]=useState<string|null>(null);
  const load=useCallback(async(section:'sessions'|'exports'|'deletion')=>{
    try{
      if(section==='sessions')setSessions(await accountService.sessions());
      else if(section==='exports')setExports(await accountService.exports());
      else setDeletion(await accountService.deletionStatus());
      setErrors(old=>({...old,[section]:''}));
    }catch(error){setErrors(old=>({...old,[section]:getErrorMessage(error,`Could not load ${section}.`)}));}
  },[]);
  useEffect(()=>{if(user?.id){void load('sessions');void load('exports');void load('deletion');}},[user?.id,load]);
  const act=async(key:string,work:()=>Promise<void>)=>{
    if(busy)return;
    setBusy(key);setMessage(null);setErrors(old=>({...old,action:''}));
    try{await work();}catch(error){setErrors(old=>({...old,action:getErrorMessage(error,'That action could not be completed. Please try again.')}));}
    finally{setBusy(null);}
  };
  if(isLoading)return <LoadingView/>;
  if(!user)return <Redirect href="/(auth)/sign-in"/>;
  const pending=user.deletionStatus==='pending_deletion'||deletion?.status==='pending';
  const administrator=user.workspaces?.includes('admin');
  return <SafeAreaView style={{flex:1,backgroundColor:'#f8fafb'}}><ScrollView automaticallyAdjustKeyboardInsets contentContainerClassName="p-4 gap-4 pb-8" keyboardShouldPersistTaps="handled">
    <Text className="text-2xl font-bold text-neutral-900">Account and security</Text>
    <Text>{user.email}</Text>
    {!pending ? <Button label="Back to your workspace" variant="outline" onPress={()=>router.replace(mobileHome(user))}/> : null}
    {pending ? <Text accessibilityRole="alert" className="rounded-lg bg-amber-50 p-3 text-amber-900">Your account is pending deletion. You can cancel during the grace period or export your data. Learning is unavailable until you cancel.</Text> : null}
    {message ? <Text accessibilityLiveRegion="polite" className="text-emerald-800">{message}</Text> : null}
    {errors.action ? <ErrorBanner message={errors.action}/> : null}
    <Card><CardTitle>Active sessions</CardTitle>
      <Text className="my-2">Revoke a session to sign that device out. Revoking this device returns you to sign in.</Text>
      {errors.sessions ? <ErrorBanner message={errors.sessions} onRetry={()=>{void load('sessions');}}/> : sessions===null ? <Text>Loading sessions…</Text> : sessions.length===0 ? <Text>No active sessions found.</Text> : sessions.map(session=><View key={session.id} className="mt-3 gap-2 rounded-lg border border-neutral-200 p-3">
        <Text className="font-semibold">{session.current?'This device':'Another session'}</Text>
        <Text>{session.user_agent||'Unknown device'}</Text><Text>Last active: {session.last_active}</Text>
        {session.ip_address ? <Text>IP: {session.ip_address}</Text> : null}
        {revokeId===session.id ? <>
          <Text>Revoke this session?</Text>
          <Button label="Confirm revoke" disabled={!!busy} onPress={()=>act('revoke',async()=>{
            await accountService.revokeSession(session.id);setRevokeId(null);
            if(session.current)await logout();else await load('sessions');
          })}/>
          <Button label="Keep session" variant="outline" onPress={()=>setRevokeId(null)}/>
        </> : <Button label={session.current?'Sign out this device':'Revoke session'} variant="outline" onPress={()=>setRevokeId(session.id)} disabled={!!busy}/>}
      </View>)}
      <Button label="Refresh sessions" variant="outline" onPress={()=>{void load('sessions');}}/>
    </Card>
    <Card><CardTitle>Download your data</CardTitle>
      <Text className="my-2">Request an archive of your account data. One export is available per 24 hours. Refresh below while it is being prepared.</Text>
      <Button label="Request data export" disabled={!!busy} onPress={()=>act('export',async()=>{await accountService.requestExport();await load('exports');setMessage('Export requested. Refresh its status when ready.');})}/>
      {errors.exports ? <ErrorBanner message={errors.exports} onRetry={()=>{void load('exports');}}/> : exports===null ? <Text>Loading exports…</Text> : exports.length===0 ? <Text>No recent data exports.</Text> : exports.map(file=><View key={file.id} className="my-2 gap-2 rounded-lg border border-neutral-200 p-3">
        <Text>{file.created_at} · {file.status}</Text>
        {file.status==='failed' ? <Text>Preparation failed. Please try again later or contact support.</Text> : null}
        {file.status==='ready' ? <Button label="Download data export" disabled={!!busy} onPress={()=>act('download',()=>accountService.downloadExport(file.id))}/> : null}
      </View>)}
      <Button label="Refresh export status" variant="outline" onPress={()=>{void load('exports');}}/>
    </Card>
    <Card><CardTitle>Account deletion</CardTitle>
      {errors.deletion ? <ErrorBanner message={errors.deletion} onRetry={()=>{void load('deletion');}}/> : deletion===null ? <Text>Loading deletion status…</Text> : <>
        {pending ? <>
          <Text className="my-2">Deletion requested. Grace period ends: {deletion.gracePeriodEndsAt||'Check your request status'}</Text>
          <Button label="Cancel account deletion" disabled={!!busy} onPress={()=>act('cancel',async()=>{
            await accountService.cancelDeletion();setConfirmation('');await load('deletion');await refresh();setMessage('Account deletion cancelled.');
          })}/>
        </> : administrator ? <Text>Administrators cannot delete their own accounts. Contact your organization administrator.</Text> : <>
          <Text className="my-2">Request deletion with a 30-day cancellation period. Access will be restricted to account management and data export. Export any data you want to keep first.</Text>
          <Input label="Type DELETE MY ACCOUNT to confirm" accessibilityLabel="Deletion confirmation" value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" autoCorrect={false}/>
          <Button label="Request account deletion" disabled={!!busy||confirmation!=='DELETE MY ACCOUNT'} onPress={()=>act('delete',async()=>{
            await accountService.requestDeletion(confirmation);setConfirmation('');await load('deletion');await refresh();
          })}/>
        </>}
      </>}
    </Card>
    <Button label="Sign out" variant="outline" onPress={()=>{void logout();}}/>
  </ScrollView></SafeAreaView>;
}
