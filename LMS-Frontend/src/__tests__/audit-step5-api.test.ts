import {AxiosError,AxiosHeaders,type InternalAxiosRequestConfig} from 'axios';
import {describe,it,expect,vi} from 'vitest';
import api,{onUnauthorized,setTokenGetter} from '../services/api';

describe('central browser API session transitions',()=>{
  it.each([['/courses',401,true],['/courses',403,false],['/courses',503,false],['/auth/login',401,false],['/auth/reset-password',401,false]])('%s status %s only invalidates credentialed sessions',async(path,status,notify)=>{
    setTokenGetter(async()=>'current-token');const listener=vi.fn(),unsubscribe=onUnauthorized(listener);
    const adapter=vi.fn(async(config:InternalAxiosRequestConfig)=>{throw new AxiosError('Failed','ERR_BAD_RESPONSE',config,undefined,{status,statusText:'Failed',headers:{},config,data:{error:{message:'Denied'}}});});
    await expect(api.get(path,{adapter})).rejects.toMatchObject({status});
    expect(listener).toHaveBeenCalledTimes(notify?1:0);if(notify)expect(listener).toHaveBeenCalledWith('current-token');unsubscribe();
  });
  it('keeps logout tied to the captured token even when the active token changes',async()=>{
    setTokenGetter(async()=>'new-token');
    const adapter=vi.fn(async(config:InternalAxiosRequestConfig)=>({status:200,statusText:'OK',headers:{},config,data:{success:true}}));
    await api.post('/auth/logout',undefined,{headers:{Authorization:'Bearer old-token'},adapter});
    expect(AxiosHeaders.from(adapter.mock.calls[0][0].headers).get('Authorization')).toBe('Bearer old-token');
  });
});
