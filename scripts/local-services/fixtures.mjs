export const readingUrl = 'http://localhost:5173/local-reading.html';
export const readingHtml = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local learning check</title></head><body><h1>Your local learning check</h1><p>This reading is served entirely by the local LMS web runner.</p><p>Return to the lesson and choose Mark lesson complete to test saving progress. The second lesson is left incomplete for you.</p></body></html>';
export function fixtureWeeks() {
    return [{ id: 'local-week-1', title: 'Week 1 — Local acceptance', order: 1, sections: [{ id: 'local-section-1', title: 'Local reading', items: [
                        { id: 'local-reading-1', type: 'text', title: 'Smoke-tested reading', order: 1, url: readingUrl, information: 'Local reading used by the automated API smoke test.' },
                        { id: 'local-reading-2', type: 'text', title: 'Try completion yourself', order: 2, url: readingUrl, information: 'Read the local resource below, then mark this lesson complete.' }
                    ] }] }];
}
// Repair only the earlier synthetic fixture's missing URLs; preserve custom data.
export function repairFixtureReadings(weeks) {
    let changed = false;
    for (const week of weeks)
        for (const section of week.sections || [])
            for (const lesson of section.items || []) {
                if (['local-reading-1', 'local-reading-2'].includes(lesson.id) && lesson.type === 'text' && !lesson.url) {
                    lesson.url = readingUrl;
                    if ([
                        '<h2>Local learning test</h2><p>This synthetic lesson uses no external content.</p>',
                        '<h2>Your next local check</h2><p>Open this lesson and mark it complete. All data stays in the local LMS database.</p>'
                    ].includes(lesson.information))
                        lesson.information = 'Read the local resource below, then mark this lesson complete.';
                    changed = true;
                }
            }
    return changed;
}
