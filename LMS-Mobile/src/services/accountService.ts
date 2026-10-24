import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import api, {getAuthToken,reportUnauthorized} from '../lib/api';
import type {ApiResponse} from '../types/api';
import {assertApiSuccess,assertApiOk,ApiRequestError} from '../utils/apiError';

export interface AccountSession {id:string;ip_address:string|null;user_agent:string|null;created_at:string;last_active:string;expires_at:string;current:boolean}
export interface DataExport {id:string;status:'pending'|'processing'|'ready'|'failed';created_at:string;completed_at:string|null;error:string|null}
export interface DeletionStatus {status:string;gracePeriodEndsAt?:string;requestedAt?:string}

export const accountService={
  async sessions():Promise<AccountSession[]> {
    return assertApiSuccess(await api.get<ApiResponse<{sessions:AccountSession[]}>>('/sessions'),'Could not load sessions.').sessions;
  },
  async revokeSession(id:string):Promise<void> {
    assertApiOk(await api.delete<ApiResponse<void>>(`/sessions/${encodeURIComponent(id)}`),'Could not revoke session.');
  },
  async exports():Promise<DataExport[]> {
    return assertApiSuccess(await api.get<ApiResponse<{exports:DataExport[]}>>('/data-export'),'Could not load data exports.').exports;
  },
  async requestExport():Promise<void> {
    assertApiOk(await api.post<ApiResponse<void>>('/data-export'),'Could not request a data export.');
  },
  async deletionStatus():Promise<DeletionStatus> {
    return assertApiSuccess(await api.get<ApiResponse<DeletionStatus>>('/account/delete/status'),'Could not load deletion status.');
  },
  async requestDeletion(confirmation:string):Promise<void> {
    assertApiOk(await api.post<ApiResponse<void>>('/account/delete',{confirmation}),'Could not request account deletion.');
  },
  async cancelDeletion():Promise<void> {
    assertApiOk(await api.post<ApiResponse<void>>('/account/delete/cancel'),'Could not cancel account deletion.');
  },
  async downloadExport(id:string):Promise<void> {
    const path=`/data-export/${encodeURIComponent(id)}`;
    const state=assertApiSuccess(await api.get<ApiResponse<{status:string}>>(path,{params:{download:false}}),'Could not check export status.');
    if(state.status!=='ready') throw new Error('Your export is not ready yet. Refresh its status and try again.');
    if(Platform.OS==='web') {
      const response=await api.get<Blob>(path,{responseType:'blob'});
      if(!response.data.type.includes('zip')) throw new Error('The export file is unavailable. Please try again.');
      const url=URL.createObjectURL(response.data);
      const link=document.createElement('a');link.href=url;link.download=`account-export-${id}.zip`;
      document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
      return;
    }
    const token=await getAuthToken();
    if(!token) throw new Error('Please sign in again to download your data.');
    if(!FileSystem.cacheDirectory || !await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable on this device.');
    const file=`${FileSystem.cacheDirectory}account-export-${id.replace(/[^a-zA-Z0-9-]/g,'')}.zip`;
    try {
      const result=await FileSystem.downloadAsync(`${api.defaults.baseURL}${path}`,file,{headers:{Authorization:`Bearer ${token}`}});
      if(result.status===401) reportUnauthorized(token);
      const contentType=Object.entries(result.headers??{}).find(([key])=>key.toLowerCase()==='content-type')?.[1]??'';
      if(result.status!==200 || !contentType.includes('zip')) throw new ApiRequestError({status:result.status,message:'Could not download the export file. Please refresh and try again.'});
      await Sharing.shareAsync(result.uri,{mimeType:'application/zip',dialogTitle:'Save your account data'});
    } finally { await FileSystem.deleteAsync(file,{idempotent:true}).catch(()=>undefined); }
  },
};
