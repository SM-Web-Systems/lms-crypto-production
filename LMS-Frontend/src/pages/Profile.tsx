import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { profileService, type CustomLink, type UserProfile } from '../services/profileService';
import { quizService } from '../services/quizService';
import { Card, CardContent } from '../components/Card';
import { Button } from '../components/Button';
import Input, { TextArea } from '../components/Input';
import {
  User, CheckCircle, Loader2, ArrowLeft, MessageCircle, AlertCircle,
  Camera, Plus, Trash2, ExternalLink, Globe, Linkedin, Github, Twitter,
  Phone, Send,
} from 'lucide-react';
import { getErrorMessage } from '../utils/apiError';
import type { QuizCompletion } from '../types/quiz';

// ── Helpers ─────────────────────────────────────────────────────────────────

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function ensureHttp(url: string): string {
  if (!url) return url;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

// ── Social icon helper ───────────────────────────────────────────────────────

interface SocialFieldProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  prefix?: string;
}

function SocialField({ label, icon, value, onChange, placeholder, prefix }: SocialFieldProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <label className="block text-xs font-medium text-neutral-500 mb-0.5">{label}</label>
        <div className="flex items-center gap-1.5">
          {prefix && <span className="text-sm text-neutral-400 shrink-0">{prefix}</span>}
          <input
            type="text"
            className="w-full text-sm rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-accent-teal/30 focus:border-accent-teal/50"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

// ── Read-only social link ─────────────────────────────────────────────────────

function SocialLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  const url = ensureHttp(href);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-sm text-accent-teal hover:underline truncate"
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label || href}</span>
      <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
    </a>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

const Profile: React.FC = () => {
  const { userId: routeUserId } = useParams<{ userId?: string }>();
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const isViewingOther = !!(routeUserId && routeUserId !== user?.id);

  // ── State ──────────────────────────────────────────────────────────────────

  const [profile, setProfile] = useState<UserProfile>({});
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [telegram, setTelegram] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [twitterUrl, setTwitterUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [customLinks, setCustomLinks] = useState<CustomLink[]>([]);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [_profileLoading, setProfileLoading] = useState(true);

  const [completions, setCompletions] = useState<(QuizCompletion & { quizTitle: string })[]>([]);
  const [quizError, setQuizError] = useState<string | null>(null);

  // ── Load profile ──────────────────────────────────────────────────────────

  const loadProfile = useCallback(async () => {
    const id = isViewingOther ? routeUserId! : user?.id;
    if (!id) return;
    setProfileLoading(true);
    try {
      const p = await profileService.get(id);
      setProfile(p);
      setName(p.displayName ?? (isViewingOther ? '' : user?.name ?? ''));
      setDescription(p.description ?? '');
      setAvatarUrl(p.avatarUrl ?? null);
      if (!isViewingOther) {
        setWhatsapp(p.whatsapp ?? '');
        setTelegram(p.telegram ?? '');
        setLinkedinUrl(p.linkedinUrl ?? '');
        setGithubUrl(p.githubUrl ?? '');
        setTwitterUrl(p.twitterUrl ?? '');
        setWebsiteUrl(p.websiteUrl ?? '');
        setCustomLinks(p.customLinks ?? []);
      }
    } catch {
      // ignore — show empty
    } finally {
      setProfileLoading(false);
    }
  }, [isViewingOther, routeUserId, user?.id, user?.name]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  // ── Load quiz completions ─────────────────────────────────────────────────

  useEffect(() => {
    const id = isViewingOther ? routeUserId! : user?.id;
    if (!id) return;
    (async () => {
      setQuizError(null);
      try {
        const list = await quizService.getCompletionsForUser(id);
        const passed = list.filter((c) => c.passed);
        const withTitles = await Promise.all(
          passed.map(async (c) => {
            const quiz = await quizService.getById(c.quizId);
            return { ...c, quizTitle: quiz?.title ?? 'Quiz' };
          })
        );
        withTitles.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
        setCompletions(withTitles);
      } catch (e) {
        setCompletions([]);
        setQuizError(getErrorMessage(e, 'Could not load completed quizzes.'));
      }
    })();
  }, [isViewingOther, routeUserId, user?.id]);

  // ── Avatar upload ─────────────────────────────────────────────────────────

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Show preview immediately
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    // Upload
    setAvatarUploading(true);
    try {
      const url = await profileService.uploadAvatar(file);
      if (url) { setAvatarUrl(url); setAvatarPreview(null); }
    } catch {
      setAvatarPreview(null);
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  // ── Save profile ──────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!user || isViewingOther) return;
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      const updated = await profileService.save(user.id, {
        displayName: name.trim() || undefined,
        description: description.trim() || undefined,
        whatsapp: whatsapp.trim() || null,
        telegram: telegram.trim() || null,
        linkedinUrl: linkedinUrl.trim() || null,
        githubUrl: githubUrl.trim() || null,
        twitterUrl: twitterUrl.trim() || null,
        websiteUrl: websiteUrl.trim() || null,
        customLinks: customLinks.filter((l) => l.url.trim()),
      });
      updateUser({ ...user, name: updated.displayName ?? user.name });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setSaveError(getErrorMessage(e, 'Could not save your profile.'));
    } finally {
      setSaving(false);
    }
  };

  // ── Custom links helpers ─────────────────────────────────────────────────

  const addLink = () => setCustomLinks((prev) => [...prev, { title: '', url: '' }]);
  const updateLink = (i: number, field: keyof CustomLink, value: string) =>
    setCustomLinks((prev) => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  const removeLink = (i: number) =>
    setCustomLinks((prev) => prev.filter((_, idx) => idx !== i));

  // ── Derived ───────────────────────────────────────────────────────────────

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-neutral-600">You must be signed in to view profiles.</p>
      </div>
    );
  }

  const displayName = name || (isViewingOther ? 'User' : user.name);
  const basePath = user.role === 'admin' ? '/admin' : '/student';
  const shownAvatar = avatarPreview ?? avatarUrl;

  const viewedProfile = isViewingOther ? profile : {
    whatsapp, telegram, linkedinUrl, githubUrl, twitterUrl, websiteUrl, customLinks,
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        {isViewingOther && (
          <Button variant="outline" size="sm" onClick={() => navigate(`${basePath}/profile`)}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to my profile
          </Button>
        )}
        <User className="h-8 w-8 text-primary-600 shrink-0" />
        <div>
          <h1 className="text-3xl font-bold text-neutral-800">
            {isViewingOther ? `${displayName}'s profile` : 'Profile'}
          </h1>
          <p className="text-neutral-600 mt-0.5">
            {isViewingOther
              ? 'View their profile and completed work.'
              : 'Edit your profile, social links, and portfolio.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* ── Left column ─────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Avatar + basic info */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold text-neutral-800 mb-5">About</h2>

              {/* Avatar row */}
              <div className="flex items-center gap-5 mb-6">
                <div className="relative shrink-0">
                  <div className="w-20 h-20 rounded-full overflow-hidden bg-primary-dark/10 flex items-center justify-center ring-2 ring-white shadow-md">
                    {shownAvatar ? (
                      <img src={shownAvatar} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl font-bold text-primary-dark">{initials(displayName)}</span>
                    )}
                  </div>
                  {avatarUploading && (
                    <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-white" />
                    </div>
                  )}
                  {!isViewingOther && (
                    <>
                      <button
                        type="button"
                        onClick={() => avatarInputRef.current?.click()}
                        className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-accent-teal text-white shadow-md hover:bg-accent-teal-hover transition-colors"
                        title="Change photo"
                      >
                        <Camera className="h-3.5 w-3.5" />
                      </button>
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarChange}
                      />
                    </>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-neutral-900 text-lg truncate">{displayName}</p>
                  <p className="text-sm text-neutral-500 truncate">Wallet: {user.walletAddress}</p>
                  {!isViewingOther && (
                    <p className="text-sm text-neutral-500 truncate">{user.email}</p>
                  )}
                  {!isViewingOther && (
                    <p className="text-xs text-neutral-400 mt-0.5 capitalize">{user.role}</p>
                  )}
                </div>
              </div>

              {/* Fields */}
              {isViewingOther ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Bio</label>
                    <p className="text-neutral-600 whitespace-pre-wrap text-sm">{description || '—'}</p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => navigate(`${basePath}/messages`, { state: { openUserId: routeUserId, openUserName: displayName } })}
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Message {displayName.split(' ')[0]}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <Input
                    label="Display name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                  />
                  <TextArea
                    label="Bio / description"
                    placeholder="Write a short description about yourself, your goals, or what you're learning."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Social & contact */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold text-neutral-800 mb-5">Social & contact</h2>
              {isViewingOther ? (
                <div className="space-y-3">
                  {viewedProfile.whatsapp ? (
                    <SocialLink
                      href={`https://wa.me/${(viewedProfile.whatsapp ?? '').replace(/\D/g, '')}`}
                      icon={<Phone className="h-4 w-4" />}
                      label={`WhatsApp: ${viewedProfile.whatsapp}`}
                    />
                  ) : null}
                  {viewedProfile.telegram ? (
                    <SocialLink
                      href={`https://t.me/${(viewedProfile.telegram ?? '').replace(/^@/, '')}`}
                      icon={<Send className="h-4 w-4" />}
                      label={`Telegram: @${(viewedProfile.telegram ?? '').replace(/^@/, '')}`}
                    />
                  ) : null}
                  {viewedProfile.linkedinUrl ? (
                    <SocialLink href={viewedProfile.linkedinUrl ?? ''} icon={<Linkedin className="h-4 w-4" />} label="LinkedIn" />
                  ) : null}
                  {viewedProfile.githubUrl ? (
                    <SocialLink href={viewedProfile.githubUrl ?? ''} icon={<Github className="h-4 w-4" />} label="GitHub" />
                  ) : null}
                  {viewedProfile.twitterUrl ? (
                    <SocialLink href={viewedProfile.twitterUrl ?? ''} icon={<Twitter className="h-4 w-4" />} label="Twitter / X" />
                  ) : null}
                  {viewedProfile.websiteUrl ? (
                    <SocialLink href={viewedProfile.websiteUrl ?? ''} icon={<Globe className="h-4 w-4" />} label={viewedProfile.websiteUrl ?? ''} />
                  ) : null}
                  {!viewedProfile.whatsapp && !viewedProfile.telegram && !viewedProfile.linkedinUrl &&
                    !viewedProfile.githubUrl && !viewedProfile.twitterUrl && !viewedProfile.websiteUrl && (
                      <p className="text-sm text-neutral-400">No social links added yet.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <SocialField
                    label="WhatsApp"
                    icon={<Phone className="h-4 w-4" />}
                    value={whatsapp}
                    onChange={setWhatsapp}
                    placeholder="+27 82 123 4567"
                  />
                  <SocialField
                    label="Telegram"
                    icon={<Send className="h-4 w-4" />}
                    value={telegram}
                    onChange={setTelegram}
                    placeholder="@yourhandle"
                    prefix="@"
                  />
                  <SocialField
                    label="LinkedIn / CV"
                    icon={<Linkedin className="h-4 w-4" />}
                    value={linkedinUrl}
                    onChange={setLinkedinUrl}
                    placeholder="linkedin.com/in/yourname"
                  />
                  <SocialField
                    label="GitHub"
                    icon={<Github className="h-4 w-4" />}
                    value={githubUrl}
                    onChange={setGithubUrl}
                    placeholder="github.com/yourname"
                  />
                  <SocialField
                    label="Twitter / X"
                    icon={<Twitter className="h-4 w-4" />}
                    value={twitterUrl}
                    onChange={setTwitterUrl}
                    placeholder="x.com/yourname"
                  />
                  <SocialField
                    label="Website / Portfolio"
                    icon={<Globe className="h-4 w-4" />}
                    value={websiteUrl}
                    onChange={setWebsiteUrl}
                    placeholder="yourportfolio.com"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Projects & links */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold text-neutral-800">Projects & links</h2>
                {!isViewingOther && (
                  <Button variant="outline" size="sm" onClick={addLink}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add link
                  </Button>
                )}
              </div>

              {isViewingOther ? (
                (profile.customLinks ?? []).length === 0 ? (
                  <p className="text-sm text-neutral-400">No projects or links shared yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {(profile.customLinks ?? []).map((link, i) => (
                      <li key={i}>
                        <SocialLink
                          href={link.url}
                          icon={<Globe className="h-4 w-4" />}
                          label={link.title || link.url}
                        />
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <div className="space-y-3">
                  {customLinks.length === 0 && (
                    <p className="text-sm text-neutral-400">No links yet. Click "Add link" to share projects, portfolios, or websites.</p>
                  )}
                  {customLinks.map((link, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <div className="flex-1 grid grid-cols-2 gap-2 min-w-0">
                        <input
                          type="text"
                          className="text-sm rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-accent-teal/30"
                          placeholder="Label (e.g. My Portfolio)"
                          value={link.title}
                          onChange={(e) => updateLink(i, 'title', e.target.value)}
                        />
                        <input
                          type="text"
                          className="text-sm rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-accent-teal/30"
                          placeholder="https://..."
                          value={link.url}
                          onChange={(e) => updateLink(i, 'url', e.target.value)}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLink(i)}
                        className="shrink-0 p-1.5 rounded-md text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Save button (own profile) */}
          {!isViewingOther && (
            <div className="flex items-center gap-3">
              <Button onClick={handleSave} disabled={saving} size="lg">
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save profile
              </Button>
              {saved && (
                <span className="inline-flex items-center text-sm text-green-600 gap-1">
                  <CheckCircle className="h-4 w-4" />
                  Saved
                </span>
              )}
              {saveError && (
                <span className="inline-flex items-center gap-1.5 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4" />
                  {saveError}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Right column ─────────────────────────────────────────────────── */}
        <div className="space-y-6">

          {/* Avatar card */}
          <Card>
            <CardContent className="p-6 flex flex-col items-center text-center">
              <div className="relative mb-4">
                <div className="w-28 h-28 rounded-full overflow-hidden bg-primary-dark/10 flex items-center justify-center ring-4 ring-white shadow-lg">
                  {shownAvatar ? (
                    <img src={shownAvatar} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl font-bold text-primary-dark">{initials(displayName)}</span>
                  )}
                </div>
                {avatarUploading && (
                  <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                    <Loader2 className="h-7 w-7 animate-spin text-white" />
                  </div>
                )}
              </div>
              <p className="font-semibold text-neutral-900 text-lg">{displayName}</p>
              {!isViewingOther && <p className="text-sm text-neutral-500 mt-0.5">{user.email}</p>}
              <p className="text-xs text-neutral-400 capitalize mt-0.5">{isViewingOther ? '' : user.role}</p>
              {!isViewingOther && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => avatarInputRef.current?.click()}
                >
                  <Camera className="h-3.5 w-3.5 mr-1.5" />
                  {avatarUrl ? 'Change photo' : 'Upload photo'}
                </Button>
              )}
              {description && (
                <p className="text-sm text-neutral-600 mt-3 text-left w-full whitespace-pre-wrap line-clamp-4">{description}</p>
              )}
            </CardContent>
          </Card>

          {/* Completed quizzes */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-base font-semibold text-neutral-800 mb-4 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                Completed
              </h2>
              {quizError ? (
                <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 mb-3">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{quizError}</span>
                </div>
              ) : null}
              {completions.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  {isViewingOther
                    ? 'No completed quizzes yet.'
                    : 'No completed quizzes yet. Take a quiz from the Quizzes page.'}
                </p>
              ) : (
                <ul className="space-y-2">
                  {completions.map((c) => (
                    <li key={c.id} className="flex items-center justify-between py-1.5 border-b border-neutral-100 last:border-0">
                      <span className="text-sm font-medium text-neutral-800 truncate mr-2">{c.quizTitle}</span>
                      <span className="text-xs text-neutral-500 shrink-0">{c.score}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Profile;
