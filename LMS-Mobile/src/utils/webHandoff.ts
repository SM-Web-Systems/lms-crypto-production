import { Linking } from 'react-native';

const base = process.env.EXPO_PUBLIC_WEB_BASE_URL || 'https://lms.smwebsystems.com';
/** Only application-owned paths are accepted. Credentials never cross through a URL. */
export function webUrl(path: string): string {
  const origin = new URL(base);
  if (!['https:','http:'].includes(origin.protocol) || origin.username || origin.password) throw new Error('The web dashboard address is not configured correctly.');
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) throw new Error('Invalid dashboard path.');
  const destination = new URL(path,origin.origin);
  if (destination.origin !== origin.origin) throw new Error('Invalid dashboard destination.');
  return destination.toString();
}
export async function openWebDashboard(path: string): Promise<void> { await Linking.openURL(webUrl(path)); }
