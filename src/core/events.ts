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

/** `searching`: a scan is running. `waiting`: idle until the next scan. */
export type EngineState = 'searching' | 'waiting' | 'stopped';

/** Why a scan started: on schedule, or because the user asked for it. */
export type ScanTrigger = 'scheduled' | 'manual';

export interface StateChange {
  state: EngineState;
  /** Number of the running scan (searching) or the last finished one (waiting/stopped). */
  scanNo: number;
  /** Set while waiting. */
  nextScanAt: Date | null;
}

/**
 * Everything the engine reports goes through these events. The console, status
 * line and Markdown outputs listen here; a future UI can listen the same way.
 */
export interface EngineEvents {
  'run:start': [{ startedAt: Date; companies: Company[]; keywords: string[]; intervalMinutes: number }];
  'state': [StateChange];
  'scan:start': [{ scanNo: number; startedAt: Date; trigger: ScanTrigger }];
  'scan:progress': [{ scanNo: number; done: number; total: number }];
  'scan:end': [ScanReport];
  'scan:failed': [{ scanNo: number; error: Error }];
  'idle': [{ nextScanAt: Date; runStartedAt: Date }];
  'run:stop': [{ startedAt: Date; stoppedAt: Date; scans: number }];
}

export class EngineEmitter extends EventEmitter<EngineEvents> {}
