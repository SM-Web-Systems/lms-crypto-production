import React, { useState, useEffect } from 'react';
import { Bell, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { notificationService, PreferenceItem } from '../services/notificationService';

const TYPE_LABELS: Record<string, string> = {
  submission_reviewed: 'Submission Reviewed',
  nft_approved: 'NFT Approved',
  nft_rejected: 'NFT Rejected',
  nft_minted: 'NFT Minted',
  course_enrolled: 'Course Enrolled',
  new_enrollment: 'New Enrollment',
  payment_confirmed: 'Payment Confirmed',
  payment_failed: 'Payment Failed',
  cohort_invited: 'Cohort Invitation',
};

const NotificationSettings: React.FC = () => {
  const navigate = useNavigate();
  const [preferences, setPreferences] = useState<PreferenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    notificationService.getPreferences()
      .then(setPreferences)
      .catch(() => setError('Failed to load preferences'))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = (type: string) => {
    setPreferences((prev) =>
      prev.map((p) => (p.type === type ? { ...p, enabled: !p.enabled } : p))
    );
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await notificationService.updatePreferences(preferences);
      setSaved(true);
    } catch {
      setError('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-lg hover:bg-neutral-100 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5 text-neutral-600" />
        </button>
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-neutral-600" aria-hidden="true" />
          <h1 className="text-xl font-semibold text-neutral-800">Notification Settings</h1>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-neutral-400">Loading preferences...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm ring-1 ring-neutral-900/5 overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-100">
            <p className="text-sm text-neutral-500">
              Choose which notification types you want to receive. Admin broadcasts cannot be disabled.
            </p>
          </div>
          <ul className="divide-y divide-neutral-100">
            {preferences.map((pref) => (
              <li key={pref.type} className="flex items-center justify-between px-5 py-3.5">
                <span className="text-sm font-medium text-neutral-700">
                  {TYPE_LABELS[pref.type] ?? pref.type}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={pref.enabled}
                  onClick={() => handleToggle(pref.type)}
                  className={[
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    pref.enabled ? 'bg-blue-600' : 'bg-neutral-200',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                      pref.enabled ? 'translate-x-6' : 'translate-x-1',
                    ].join(' ')}
                  />
                </button>
              </li>
            ))}
          </ul>
          <div className="px-5 py-4 border-t border-neutral-100 flex items-center justify-between">
            {saved && <span className="text-sm text-green-600">Preferences saved</span>}
            {!saved && <span />}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationSettings;
