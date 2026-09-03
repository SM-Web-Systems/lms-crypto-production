/**
 * Detect direct video/audio files (native elements) vs hosted embeds (iframe).
 */
const VIDEO_FILE_EXT = /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i;
const AUDIO_FILE_EXT = /\.(mp3|wav|aac|m4a|flac|opus|oga)(\?|#|$)/i;
const OFFICE_FILE_EXT = /\.(pptx|ppt|ppsx|pps)(\?|#|$)/i;

export function isDirectVideoFileUrl(url: string): boolean {
  const s = url.trim();
  if (!s) return false;
  try {
    const u = new URL(s);
    return VIDEO_FILE_EXT.test(u.pathname);
  } catch {
    return VIDEO_FILE_EXT.test(s);
  }
}

/** YouTube id from watch / embed / shorts / live / youtu.be */
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

    if (h === 'youtube.com' || h === 'm.youtube.com' || h === 'www.youtube-nocookie.com') {
      if (u.pathname.startsWith('/embed/')) {
        const id = u.pathname.slice('/embed/'.length).split(/[/?]/)[0];
        return id || null;
      }
      if (u.pathname.startsWith('/shorts/')) {
        const id = u.pathname.slice('/shorts/'.length).split(/[/?]/)[0];
        return id || null;
      }
      if (u.pathname.startsWith('/live/')) {
        const id = u.pathname.slice('/live/'.length).split(/[/?]/)[0];
        return id || null;
      }
      const v = u.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{6,}$/.test(v)) return v;
    }
  } catch {
    /* ignore */
  }

  const m1 = s.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|shorts\/|live\/))([a-zA-Z0-9_-]{6,})/);
  if (m1) return m1[1];
  const m2 = s.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
  return m2 ? m2[1] : null;
}

/** Validate a bare YouTube video ID (11 chars, alphanumeric + dash + underscore). */
const YT_ID_RE = /^[a-zA-Z0-9_-]{6,12}$/;
export function isValidYoutubeId(id: string | undefined | null): id is string {
  return typeof id === 'string' && YT_ID_RE.test(id);
}

/** Build a YouTube watch URL from a validated ID. Returns null for invalid IDs. */
export function youtubeWatchUrl(id: string | undefined | null): string | null {
  if (!isValidYoutubeId(id)) return null;
  return `https://www.youtube.com/watch?v=${id}`;
}

/** Build a YouTube embed URL from a validated ID. Returns null for invalid IDs. */
export function youtubeEmbedUrl(id: string | undefined | null): string | null {
  if (!isValidYoutubeId(id)) return null;
  return `https://www.youtube.com/embed/${id}?rel=0`;
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

/**
 * iframe `src` for embedded players. Unknown URLs pass through (already an embed, or host-specific).
 */
export function getIframeVideoEmbedSrc(url: string): string {
  const s = url.trim();
  if (!s || isDirectVideoFileUrl(s)) return s;

  const yt = extractYoutubeId(s);
  if (yt) return `https://www.youtube.com/embed/${yt}?rel=0`;

  const vm = extractVimeoId(s);
  if (vm) return `https://player.vimeo.com/video/${vm}`;

  return s;
}

/** YouTube / Vimeo watch links and direct video files → open in in-app modal (not a new tab). */
export function shouldOpenVideoInModal(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  return isDirectVideoFileUrl(u) || extractYoutubeId(u) !== null || extractVimeoId(u) !== null;
}

export function isDirectAudioFileUrl(url: string): boolean {
  const s = url.trim();
  if (!s) return false;
  try {
    const u = new URL(s);
    return AUDIO_FILE_EXT.test(u.pathname);
  } catch {
    return AUDIO_FILE_EXT.test(s);
  }
}

export function isOfficePresentationUrl(url: string): boolean {
  const s = url.trim();
  if (!s) return false;
  try {
    const u = new URL(s);
    return OFFICE_FILE_EXT.test(u.pathname);
  } catch {
    return OFFICE_FILE_EXT.test(s);
  }
}

/** Returns the Office Online embed URL for a publicly accessible PPTX/PPT URL. */
export function getOfficeOnlineEmbedUrl(url: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url.trim())}`;
}

export function isGoogleDriveUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    const h = u.hostname.replace(/^www\./, '').toLowerCase();
    return h === 'drive.google.com' || h === 'docs.google.com' || h === 'sheets.google.com' || h === 'slides.google.com';
  } catch {
    return false;
  }
}

/** Audio files and presentations → render in-app (not external tab). */
export function shouldOpenInAppPlayer(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  return isDirectAudioFileUrl(u) || isOfficePresentationUrl(u);
}
