import { companyId, type AtsId, type Company } from '../types.js';
import { ashby } from './ashby.js';
import { greenhouse } from './greenhouse.js';
import { lever } from './lever.js';
import type { AtsProvider } from './types.js';
import { workday } from './workday.js';

export const providers: readonly AtsProvider[] = [greenhouse, lever, ashby, workday];

export function getProvider(id: AtsId): AtsProvider {
  const p = providers.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown ATS: ${id}`);
  return p;
}

export function createCompany(fields: {
  ats: AtsId;
  token: string;
  name: string;
  source: Company['source'];
  resolvedBy: Company['resolvedBy'];
  sampleUrls?: string[];
}): Company {
  return {
    id: companyId(fields.ats, fields.token),
    name: fields.name,
    ats: fields.ats,
    token: fields.token,
    api: getProvider(fields.ats).apiUrl(fields.token),
    source: fields.source,
    resolvedBy: fields.resolvedBy,
    sampleUrls: fields.sampleUrls ?? [],
  };
}
