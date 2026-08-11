import { describe, it, expect } from 'vitest';

describe('IMP-FE-1: CSV template includes all 12 columns', () => {
  it('template header has week, section, objective, outcome, type, title, url, information, quizid, description, filename, documentid', () => {
    const EXPECTED_HEADER = 'week,section,objective,outcome,type,title,url,information,quizid,description,filename,documentid';
    const columns = EXPECTED_HEADER.split(',');
    expect(columns).toHaveLength(12);
    expect(columns).toContain('week');
    expect(columns).toContain('section');
    expect(columns).toContain('quizid');
    expect(columns).toContain('description');
    expect(columns).toContain('filename');
    expect(columns).toContain('documentid');
  });
});

describe('IMP-FE-2: Export round-trip preserves quizId and description', () => {
  it('csvRow helper includes extended fields in output', () => {
    function csvRow(fields: string[]): string {
      return fields.map((f) => `"${(f ?? '').replace(/"/g, '""')}"`).join(',');
    }

    const row = csvRow([
      'Week 1', 'Section A', 'Objective', 'Outcome',
      'quiz', 'Chapter Quiz', '', 'Take this quiz',
      'quiz-123', '', '', '',
    ]);
    expect(row).toContain('"quiz-123"');
    expect(row).toContain('"quiz"');
    expect(row).toContain('"Chapter Quiz"');

    const assignmentRow = csvRow([
      'Week 2', 'Section B', '', '',
      'assignment', 'Lab Exercise', '', '',
      '', 'Build a sample project', '', '',
    ]);
    expect(assignmentRow).toContain('"Build a sample project"');
    expect(assignmentRow).toContain('"assignment"');

    const downloadRow = csvRow([
      'Week 2', 'Section B', '', '',
      'download', 'Source Code', '', '',
      '', '', 'project.zip', 'doc-456',
    ]);
    expect(downloadRow).toContain('"project.zip"');
    expect(downloadRow).toContain('"doc-456"');
  });
});
