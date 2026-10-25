import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureWeeks, readingUrl, readingHtml, repairFixtureReadings } from './fixtures.mjs';
test('synthetic text lessons supply the HTTP resource required by the native reader', () => {
    const lessons = fixtureWeeks().flatMap(w => w.sections).flatMap(s => s.items);
    assert.equal(lessons.length, 2);
    for (const lesson of lessons) {
        assert.equal(lesson.type, 'text');
        assert.equal(lesson.url, readingUrl);
        assert.equal(new URL(lesson.url).origin, 'http://localhost:5173');
        assert.doesNotMatch(lesson.information, /<[a-z]/i);
    }
    assert.match(readingHtml, /Your local learning check/);
    assert.doesNotMatch(readingHtml, /<script|https?:/i);
});
test('repair fills only missing synthetic reading URLs and preserves custom content', () => {
    const weeks = fixtureWeeks();
    const first = weeks[0].sections[0].items[0], second = weeks[0].sections[0].items[1];
    delete first.url;
    first.information = '<h2>Old local fixture</h2>';
    first.title = 'Custom title';
    second.url = 'http://localhost:5173/custom-reading.html';
    weeks[0].sections[0].items.push({ id: 'user-authored', type: 'text', title: 'Custom', information: 'Keep me' });
    assert.equal(repairFixtureReadings(weeks), true);
    assert.equal(first.url, readingUrl);
    assert.equal(first.title, 'Custom title');
    assert.equal(second.url, 'http://localhost:5173/custom-reading.html');
    assert.equal(weeks[0].sections[0].items[2].url, undefined);
    assert.equal(repairFixtureReadings(weeks), false);
});
