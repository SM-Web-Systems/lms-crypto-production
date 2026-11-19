// Minimal JUnit reporter for Jest, so CircleCI can store LMS-Mobile test results
// without adding a dependency. Writes to the path in JEST_JUNIT_OUTPUT_FILE.
const fs = require('node:fs');
const path = require('node:path');

const esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
// Strip ANSI colour codes and characters XML 1.0 does not allow.
const clean = (s) => String(s).replace(/\u001b\[[0-9;]*m/g, '').replace(/[^\x09\x0A\x0D\x20-퟿-�]/g, '');

class JunitReporter {
  constructor(globalConfig) {
    this.rootDir = globalConfig.rootDir;
  }

  onRunComplete(_contexts, results) {
    const out = process.env.JEST_JUNIT_OUTPUT_FILE || 'junit.xml';
    const suites = results.testResults.map((file) => {
      const rel = path.relative(this.rootDir, file.testFilePath).split(path.sep).join('/');
      const cases = file.testResults.map((t) => {
        const time = ((t.duration || 0) / 1000).toFixed(3);
        const name = esc([...t.ancestorTitles, t.title].join(' › '));
        let body = '';
        if (t.status === 'failed') body = `<failure message="${esc(clean(t.failureMessages[0] || 'failed').split('\n')[0])}">${esc(clean(t.failureMessages.join('\n')))}</failure>`;
        else if (t.status === 'pending' || t.status === 'skipped' || t.status === 'todo') body = '<skipped/>';
        return `    <testcase classname="${esc(rel)}" name="${name}" file="${esc(rel)}" time="${time}">${body}</testcase>`;
      });
      if (file.testExecError) {
        cases.push(`    <testcase classname="${esc(rel)}" name="suite failed to run" file="${esc(rel)}" time="0"><error message="${esc(clean(file.testExecError.message).split('\n')[0])}">${esc(clean(file.failureMessage || file.testExecError.message))}</error></testcase>`);
      }
      const failures = file.numFailingTests;
      const errors = file.testExecError ? 1 : 0;
      const time = ((file.perfStats.end - file.perfStats.start) / 1000).toFixed(3);
      return `  <testsuite name="${esc(rel)}" file="${esc(rel)}" tests="${cases.length}" failures="${failures}" errors="${errors}" skipped="${file.numPendingTests + (file.numTodoTests || 0)}" time="${time}">\n${cases.join('\n')}\n  </testsuite>`;
    });
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="jest" tests="${results.numTotalTests}" failures="${results.numFailedTests}">\n${suites.join('\n')}\n</testsuites>\n`;
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, xml);
  }
}

module.exports = JunitReporter;
