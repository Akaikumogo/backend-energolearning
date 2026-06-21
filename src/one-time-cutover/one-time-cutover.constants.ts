import * as path from 'path';

export const ONE_TIME_CUTOVER_ROUTE = 'admin/one-time/energo-id-cutover';

export const ONE_TIME_CUTOVER_FLAG_PATH = path.join(
  process.cwd(),
  'data',
  'runtime',
  'energo-id-cutover.done',
);

export const ONE_TIME_CUTOVER_SCRIPT = 'cutover-energo-id-fresh-start.mjs';
