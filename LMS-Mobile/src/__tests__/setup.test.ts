describe('Test infrastructure', () => {
  it('runs a basic assertion', () => {
    expect(1 + 1).toBe(2);
  });

  it('handles async operations', async () => {
    const result = await Promise.resolve('ok');
    expect(result).toBe('ok');
  });
});
