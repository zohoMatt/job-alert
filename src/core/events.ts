import { EventEmitter } from 'node:events';
import type { MatchRecord } from '../store/match-log.js';
import type { Company } from '../types.js';

export interface CompanyError {
  company: Company;
  message: string;
}

export interface ScanReport {
  scanNo: number;
  startedAt: Date;
  endedAt: Date;
  durationMs: number;
  companiesScanned: number;
  jobsSeen: number;
  matched: number;
  /** Matches not reported before, newest first. */
  newMatches: MatchRecord[];
  errors: CompanyError[];
}

/**
 * Everything the engine reports goes through these events. The console and
 * Markdown outputs listen here; a future UI can listen the same way.
 */
export interface EngineEvents {
  'run:start': [{ startedAt: Date; companies: Company[]; keywords: string[]; intervalMinutes: number }];
  'scan:start': [{ scanNo: number; startedAt: Date }];
  'scan:end': [ScanReport];
  'scan:failed': [{ scanNo: number; error: Error }];
  'idle': [{ nextScanAt: Date; runStartedAt: Date }];
  'run:stop': [{ startedAt: Date; stoppedAt: Date; scans: number }];
}

export class EngineEmitter extends EventEmitter<EngineEvents> {}
