/**
 * EmailTemplatePanel — Phase 22 C3: admin panel for viewing/editing email templates.
 */

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardTitle } from './Card';
import { Button } from './Button';
import { Mail, ChevronDown, ChevronRight, Loader2, AlertCircle, Eye, Save } from 'lucide-react';
import { emailTemplateService, type EmailTemplate } from '../services/emailTemplateService';
import { getErrorMessage } from '../utils/apiError';

const CATEGORY_COLORS: Record<string, string> = {
  enrollment: 'bg-blue-100 text-blue-800',
  auth: 'bg-amber-100 text-amber-800',
  invitation: 'bg-green-100 text-green-800',
  payment: 'bg-violet-100 text-violet-800',
  cohort: 'bg-teal-100 text-teal-800',
  certificate: 'bg-purple-100 text-purple-800',
  admin: 'bg-red-100 text-red-800',
};

export function EmailTemplatePanel() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await emailTemplateService.listTemplates();
      setTemplates(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleExpand = (slug: string, template: EmailTemplate) => {
    if (expanded === slug) {
      setExpanded(null);
      setPreviewHtml(null);
      setPreviewSubject(null);
      return;
    }
    setExpanded(slug);
    setEditSubject(template.subject);
    setEditBody(template.bodyHtml);
    setPreviewHtml(null);
    setPreviewSubject(null);
  };

  const handleSave = async (slug: string) => {
    setSaving(true);
    setError(null);
    try {
      await emailTemplateService.updateTemplate(slug, { subject: editSubject, bodyHtml: editBody });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async (slug: string) => {
    try {
      const result = await emailTemplateService.previewTemplate(slug);
      setPreviewSubject(result.subject);
      setPreviewHtml(result.html);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Card className="shadow-updraft overflow-hidden ring-1 ring-neutral-900/[0.04]" data-testid="email-template-panel">
      <div className="border-b border-neutral-200/90 bg-gradient-to-r from-neutral-50 via-white to-neutral-50/80 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary-500" aria-hidden />
          <CardTitle className="border-0 p-0 text-neutral-900">Email Templates</CardTitle>
        </div>
      </div>
      <CardContent className="p-4 sm:p-6">
        {error && (
          <div className="mb-3 p-2 bg-red-50 text-red-700 rounded text-sm flex items-center gap-1">
            <AlertCircle className="w-4 h-4" />{error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading templates...
          </div>
        ) : templates.length === 0 ? (
          <p className="text-sm text-gray-500">No email templates found.</p>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <div key={t.slug} className="border rounded-lg overflow-hidden">
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50"
                  onClick={() => handleExpand(t.slug, t)}
                  data-testid={`template-row-${t.slug}`}
                >
                  {expanded === t.slug ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  <span className="font-medium text-sm">{t.name}</span>
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${CATEGORY_COLORS[t.category] ?? 'bg-gray-100 text-gray-600'}`}>
                    {t.category}
                  </span>
                  <span className="text-xs text-gray-400 ml-auto">v{t.version}</span>
                </div>

                {expanded === t.slug && (
                  <div className="px-4 py-3 bg-gray-50 border-t space-y-3" data-testid="template-edit-form">
                    <div>
                      <label htmlFor={`subject-${t.slug}`} className="block text-xs font-medium text-gray-500 mb-1">Subject</label>
                      <input
                        id={`subject-${t.slug}`}
                        className="w-full border rounded px-3 py-2 text-sm"
                        value={editSubject}
                        onChange={(e) => setEditSubject(e.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor={`body-${t.slug}`} className="block text-xs font-medium text-gray-500 mb-1">
                        Body HTML <span className="text-gray-400">(use {'{{var}}'} for escaped, {'{{{var}}}'} for URLs)</span>
                      </label>
                      <textarea
                        id={`body-${t.slug}`}
                        className="w-full border rounded px-3 py-2 text-sm font-mono"
                        rows={10}
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                      />
                    </div>
                    <div className="text-xs text-gray-400">
                      Variables: {t.variables.join(', ')}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleSave(t.slug)} disabled={saving} data-testid="btn-save-template">
                        {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handlePreview(t.slug)} data-testid="btn-preview-template">
                        <Eye className="w-3 h-3 mr-1" /> Preview
                      </Button>
                    </div>

                    {previewHtml && (
                      <div className="mt-3 border rounded bg-white p-3" data-testid="template-preview">
                        <div className="text-xs font-medium text-gray-500 mb-1">Preview: {previewSubject}</div>
                        <div className="text-sm prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
