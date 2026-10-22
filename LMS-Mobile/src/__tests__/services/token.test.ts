describe('secure session storage',()=>{
  let tokens:typeof import('@/lib/token');
  let store:{getItemAsync:jest.Mock;setItemAsync:jest.Mock;deleteItemAsync:jest.Mock};
  beforeEach(()=>{
    jest.resetModules();
    jest.doMock('react-native',()=>({Platform:{OS:'ios'}}));
    tokens=require('@/lib/token');store=require('expo-secure-store');
    store.getItemAsync.mockReset().mockResolvedValue(null);store.setItemAsync.mockReset().mockResolvedValue(undefined);store.deleteItemAsync.mockReset().mockResolvedValue(undefined);
  });
  it('keeps a fresh in-memory token when persistence fails',async()=>{
    store.setItemAsync.mockRejectedValueOnce(new Error('Storage unavailable'));
    expect(await tokens.setStoredToken('live-token')).toBe(false);
    expect(await tokens.getStoredToken()).toBe('live-token');
  });
  it('does not convert a storage read error into a missing session',async()=>{
    store.getItemAsync.mockRejectedValueOnce(new Error('Locked'));
    await expect(tokens.getStoredToken()).rejects.toThrow('Locked');
    store.getItemAsync.mockResolvedValueOnce('saved-token');
    expect(await tokens.getStoredToken()).toBe('saved-token');
  });
  it('does not resurrect a token from a read completing after sign-out',async()=>{
    let resolve!:(value:string)=>void;
    store.getItemAsync.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
    const reading=tokens.getStoredToken();await tokens.clearStoredToken();resolve('old-token');
    expect(await reading).toBeNull();expect(await tokens.getStoredToken()).toBeNull();
  });
  it('orders a delayed persistence write before a later sign-out deletion',async()=>{
    let resolve!:()=>void;
    store.setItemAsync.mockImplementationOnce(()=>new Promise<void>(done=>{resolve=done;}));
    const writing=tokens.setStoredToken('old-token');await Promise.resolve();
    const clearing=tokens.clearStoredToken();expect(await tokens.getStoredToken()).toBeNull();
    expect(store.deleteItemAsync).not.toHaveBeenCalled();resolve();await writing;await clearing;
    expect(store.deleteItemAsync).toHaveBeenCalledWith('lms_token');
  });
});
