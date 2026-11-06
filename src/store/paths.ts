import path from 'node:path';

const root = process.env.JOB_ALERT_HOME ? path.resolve(process.env.JOB_ALERT_HOME) : process.cwd();

export const paths = {
  root,
  dataDir: path.join(root, 'data'),
  outputDir: path.join(root, 'output'),
  companies: path.join(root, 'data', 'companies.json'),
  config: path.join(root, 'data', 'config.json'),
  matchLog: path.join(root, 'output', 'matches.jsonl'),
  dailyMarkdown: (date: string) => path.join(root, 'output', `jobs-${date}.md`),
};
