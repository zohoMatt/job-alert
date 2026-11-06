import { describe, expect, it } from 'vitest';
import { openCommand } from '../src/core/open-file.js';

describe('openCommand', () => {
  it('uses open on macOS', () => {
    expect(openCommand('/Users/me/job alert/output/jobs-2026-11-05.md', 'darwin')).toEqual({
      cmd: 'open',
      args: ['/Users/me/job alert/output/jobs-2026-11-05.md'],
    });
  });
  it('uses explorer.exe on Windows (path with spaces passed as one argument)', () => {
    expect(openCommand('C:\\Users\\Matt Zuo\\job-alert\\output\\jobs-2026-11-05.md', 'win32')).toEqual({
      cmd: 'explorer.exe',
      args: ['C:\\Users\\Matt Zuo\\job-alert\\output\\jobs-2026-11-05.md'],
    });
  });
  it('uses xdg-open elsewhere', () => {
    expect(openCommand('/tmp/a.md', 'linux').cmd).toBe('xdg-open');
  });
});
