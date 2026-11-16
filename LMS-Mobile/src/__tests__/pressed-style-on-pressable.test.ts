import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * NativeWind turns any View that has a pseudo-class style (active:, hover:, focus:) into a
 * Pressable. When that View sits inside a Pressable that owns the onPress handler, the inner
 * Pressable takes the touch on a phone and the outer onPress never runs. Web and the Jest
 * press helpers still reach the outer handler, so the fault only shows on a real device
 * (the Certificates list tapped to nothing on Android). Put the pressed style on the
 * Pressable that has the onPress handler instead.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

describe('pressed styles', () => {
  it('are never put on a View or Card, only on the Pressable that handles the press', () => {
    const offenders: string[] = [];
    const pattern = /<(View|Card)\b[^>]*?className=["'][^"']*\b(active|hover|focus):/;
    for (const file of sourceFiles(join(__dirname, '..'))) {
      if (pattern.test(readFileSync(file, 'utf8'))) offenders.push(file.replace(/.*\/src\//, 'src/'));
    }
    expect(offenders).toEqual([]);
  });
});
