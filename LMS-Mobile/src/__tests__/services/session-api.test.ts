import {AxiosError,AxiosHeaders,type InternalAxiosRequestConfig} from 'axios';
import api,{setTokenGetter,onUnauthorized} from '@/lib/api';

describe('central API unauthorized handling',()=>{
  beforeEach(()=>{setTokenGetter(async()=>'current-token');});
  it.each([['/courses',401,true],['/courses',403,false],['/courses',503,false],['/auth/login',401,false],['/auth/reset-password',401,false]])('%s with %s notifies only an authenticated invalid session',async(path,status,notify)=>{
    const listener=jest.fn(),unsubscribe=onUnauthorized(listener);
    const adapter=jest.fn(async(config:InternalAxiosRequestConfig)=>{throw new AxiosError('Failed','ERR_BAD_RESPONSE',config,undefined,{status,statusText:'Failed',headers:{},config,data:{error:{message:'Denied'}}});});
    await expect(api.get(path,{adapter})).rejects.toMatchObject({status});
    expect(listener).toHaveBeenCalledTimes(notify?1:0);if(notify)expect(listener).toHaveBeenCalledWith('current-token');unsubscribe();
  });
  it('preserves explicit credentials for a logout racing a newer login',async()=>{
    const adapter=jest.fn(async(config:InternalAxiosRequestConfig)=>({status:200,statusText:'OK',headers:{},config,data:{success:true}}));
    await api.post('/auth/logout',undefined,{headers:{Authorization:'Bearer old-token'},adapter});
    expect(AxiosHeaders.from(adapter.mock.calls[0][0].headers).get('Authorization')).toBe('Bearer old-token');
  });
});
