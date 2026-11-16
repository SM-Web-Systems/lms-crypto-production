import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }));
import api from '../../services/api';
import WebPushCard from '../../components/WebPushCard';

const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const desktop = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
function setDevice(ua: string, standalone: boolean) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
  Object.defineProperty(navigator, 'standalone', { value: standalone, configurable: true });
}
const subscription = { endpoint: 'https://web.push.apple.com/abc', toJSON: () => ({ endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'p', auth: 'a' } }) };
function pushApis(permission: NotificationPermission, existing: unknown = null) {
  const pushManager = { getSubscription: vi.fn(async () => existing), subscribe: vi.fn(async () => subscription) };
  const reg = { pushManager };
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
    register: vi.fn(async () => reg), getRegistration: vi.fn(async () => reg), ready: Promise.resolve(reg) } });
  vi.stubGlobal('PushManager', function PushManager() {});
  const N = { permission, requestPermission: vi.fn(async () => { N.permission = 'granted'; return 'granted'; }) };
  vi.stubGlobal('Notification', N);
  return { pushManager, N };
}

describe('WebPushCard', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: { enabled: true, publicKey: 'BAAA' } } });
    vi.mocked(api.put).mockResolvedValue({ data: { success: true } });
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it('tells iPhone Safari tab users to add the app to the Home Screen and offers no button', async () => {
    setDevice(iphone, false); pushApis('default');
    render(<WebPushCard />);
    expect(await screen.findByText(/only work in the LMS app on your Home Screen/)).toBeInTheDocument();
    expect(screen.getByText('Add to Home Screen')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Enable notifications/ })).toBeNull();
  });

  it('enables push from the Home Screen app and saves the subscription', async () => {
    setDevice(iphone, true); const { pushManager, N } = pushApis('default');
    render(<WebPushCard />);
    await userEvent.click(await screen.findByRole('button', { name: 'Enable notifications' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/notifications/push/web/subscription', subscription.toJSON()));
    expect(N.requestPermission).toHaveBeenCalled();
    expect(pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(await screen.findByRole('button', { name: 'Send a test notification' })).toBeInTheDocument();
  });

  it('sends a test push when already enabled', async () => {
    setDevice(desktop, false); pushApis('granted', subscription);
    render(<WebPushCard />);
    await userEvent.click(await screen.findByRole('button', { name: 'Send a test notification' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/notifications/push/web/test'));
  });

  it('says so when the server has no push keys', async () => {
    setDevice(desktop, false); pushApis('default');
    vi.mocked(api.get).mockResolvedValue({ data: { data: { enabled: false, publicKey: null } } });
    render(<WebPushCard />);
    expect(await screen.findByText(/not switched on for this LMS server/)).toBeInTheDocument();
  });
});
