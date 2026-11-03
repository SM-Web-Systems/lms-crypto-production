import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import api,{reportUnauthorized} from '@/lib/api';
import {accountService} from '@/services/accountService';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),delete:jest.fn(),defaults:{baseURL:'https://example.invalid/api/v1'}},getAuthToken:jest.fn().mockResolvedValue('private-token'),reportUnauthorized:jest.fn()}));
jest.mock('expo-file-system/legacy',()=>({cacheDirectory:'file:///cache/',downloadAsync:jest.fn(),deleteAsync:jest.fn().mockResolvedValue(undefined)}));
const get=api.get as jest.Mock,download=FileSystem.downloadAsync as jest.Mock;
beforeEach(()=>{
  jest.clearAllMocks();get.mockResolvedValue({data:{success:true,data:{status:'ready'}}});
  download.mockResolvedValue({status:200,uri:'file:///cache/export.zip',headers:{'Content-Type':'application/zip'}});
});
describe('personal account exports',()=>{
  it('uses authenticated native download, shares the archive, and removes its temporary copy',async()=>{
    await accountService.downloadExport('export-id');
    expect(get).toHaveBeenCalledWith('/data-export/export-id',{params:{download:false}});
    expect(download).toHaveBeenCalledWith('https://example.invalid/api/v1/data-export/export-id','file:///cache/account-export-export-id.zip',{headers:{Authorization:'Bearer private-token'}});
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/export.zip',expect.objectContaining({mimeType:'application/zip'}));
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///cache/account-export-export-id.zip',{idempotent:true});
  });
  it('does not download an export still being prepared',async()=>{
    get.mockResolvedValueOnce({data:{success:true,data:{status:'processing'}}});
    await expect(accountService.downloadExport('export-id')).rejects.toThrow('not ready');expect(download).not.toHaveBeenCalled();
  });
  it('does not share JSON or failed downloads as an archive',async()=>{
    download.mockResolvedValueOnce({status:200,uri:'file:///cache/export.zip',headers:{'content-type':'application/json'}});
    await expect(accountService.downloadExport('export-id')).rejects.toThrow('Could not download');
    expect(Sharing.shareAsync).not.toHaveBeenCalled();expect(FileSystem.deleteAsync).toHaveBeenCalled();
  });
  it('centrally invalidates an expired session from a native file download',async()=>{
    download.mockResolvedValueOnce({status:401,uri:'file:///cache/export.zip',headers:{}});
    await expect(accountService.downloadExport('export-id')).rejects.toMatchObject({status:401});
    expect(reportUnauthorized).toHaveBeenCalledWith('private-token');expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });
});
