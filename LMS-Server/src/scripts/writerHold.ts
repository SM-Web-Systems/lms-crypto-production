/** One-shot release control. Touches only the hold file, never the database. */
import { engageWriterHold, isWriterHoldActive, releaseWriterHold } from '../services/writerHold.js';

const action = process.argv[2];
if (action === 'hold') engageWriterHold();
else if (action === 'release') releaseWriterHold();
else if (action !== 'status') {
  console.error('Usage: writerHold.js hold|release|status');
  process.exit(2);
}
console.log(isWriterHoldActive() ? 'held' : 'released');
