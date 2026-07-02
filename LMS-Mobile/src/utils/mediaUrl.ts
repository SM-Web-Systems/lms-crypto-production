const VIDEO_FILE_EXT = /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i;

export function isDirectVideoFileUrl(url: string): boolean {
  const s = url.trim();
  if (!s) return false;
  try {
    return VIDEO_FILE_EXT.test(new URL(s).pathname);
  } catch {
    return VIDEO_FILE_EXT.test(s);
  }
}

export function extractYoutubeId(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    const h = u.hostname.replace(/^www\./, '').toLowerCase();
    if (h === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0];
      return id && /^[a-zA-Z0-9_-]{6,}$/.test(id) ? id : null;
    }
    if (h === 'youtube.com' || h === 'm.youtube.com') {
      if (u.pathname.startsWith('/embed/')) return u.pathname.slice('/embed/'.length).split(/[/?]/)[0] || null;
      if (u.pathname.startsWith('/shorts/')) return u.pathname.slice('/shorts/'.length).split(/[/?]/)[0] || null;
      const v = u.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{6,}$/.test(v)) return v;
    }
  } catch {
    /* ignore */
  }
  const m1 = s.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|shorts\/))([a-zA-Z0-9_-]{6,})/);
  if (m1) return m1[1];
  const m2 = s.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
  return m2 ? m2[1] : null;
}

export function extractVimeoId(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    const h = u.hostname.replace(/^www\./, '').toLowerCase();
    if (h !== 'vimeo.com' && !h.endsWith('.vimeo.com')) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && /^\d+$/.test(last)) return last;
  } catch {
    /* ignore */
  }
  return null;
}

export function getIframeVideoEmbedSrc(url: string): string {
  const s = url.trim();
  if (!s || isDirectVideoFileUrl(s)) return s;
  const yt = extractYoutubeId(s);
  if (yt) return `https://www.youtube.com/embed/${yt}?rel=0`;
  const vm = extractVimeoId(s);
  if (vm) return `https://player.vimeo.com/video/${vm}`;
  return s;
}
