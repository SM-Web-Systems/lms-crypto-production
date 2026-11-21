// Additive only: per-course approved GitHub content sources, a cache of server-rendered GitHub
// markdown, and lesson media play events for view analytics.
export const courseContentTables = ['course_content_sources', 'course_content_cache', 'media_play_events'];

export const courseContentSchema = `
CREATE TABLE IF NOT EXISTS course_content_sources (
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  owner TEXT NOT NULL CHECK (owner = lower(owner) AND length(owner) BETWEEN 1 AND 100),
  repo TEXT NOT NULL CHECK (repo = lower(repo) AND length(repo) BETWEEN 1 AND 100),
  ref TEXT NOT NULL CHECK (length(ref) BETWEEN 1 AND 100),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (course_id, owner, repo)
);

CREATE TABLE IF NOT EXISTS course_content_cache (
  source_url TEXT PRIMARY KEY NOT NULL,
  html TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS media_play_events (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('youtube_embed','youtube_app','direct_file','offline_file')),
  event TEXT NOT NULL CHECK (event IN ('start','progress','complete','open_external')),
  percent INTEGER CHECK (percent IS NULL OR (percent BETWEEN 0 AND 100)),
  platform TEXT NOT NULL CHECK (platform IN ('web','android','ios')),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_play_events_course ON media_play_events(course_id, created_at);
`;
