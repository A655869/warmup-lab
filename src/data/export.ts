import { db, type RoundRecord } from './db';
import { PARAMS_VERSION } from './params';

/** 数据导出/导入/清空（手册 §12.2）：JSON 备份导入、CSV 导出及清空数据 */

export interface BackupFile {
  app: 'warmup-lab';
  paramsVersion: string;
  exportedAt: string;
  rounds: RoundRecord[];
}

export async function exportJson(): Promise<string> {
  const rounds = await db.rounds.toArray();
  const backup: BackupFile = {
    app: 'warmup-lab',
    paramsVersion: PARAMS_VERSION,
    exportedAt: new Date().toISOString(),
    rounds,
  };
  return JSON.stringify(backup, null, 2);
}

const CSV_HEADER =
  'id,scenarioId,outcome,weaponId,paramsVersion,startedAt,timeToFirstShotSec,timeToFirstHitSec,timeToKillSec,shots,hits,speedAtFirstShotMps,firstShotHit,stopWaitSec';

export async function exportCsv(): Promise<string> {
  const rounds = await db.rounds.toArray();
  const lines = rounds.map((r) =>
    [
      r.id,
      r.scenarioId,
      r.outcome,
      r.weaponId,
      r.paramsVersion,
      r.startedAt,
      r.timeToFirstShotSec ?? '',
      r.timeToFirstHitSec ?? '',
      r.timeToKillSec ?? '',
      r.shots,
      r.hits,
      r.speedAtFirstShotMps ?? '',
      r.firstShotHit ?? '',
      r.stopWaitSec ?? '',
    ].join(','),
  );
  return [CSV_HEADER, ...lines].join('\n');
}

/** 导入 JSON 备份；返回导入条数。非法文件抛错，不静默忽略（手册 §5.3） */
export async function importJson(text: string): Promise<number> {
  const data = JSON.parse(text) as BackupFile;
  if (data.app !== 'warmup-lab' || !Array.isArray(data.rounds))
    throw new Error('不是有效的 Warmup Lab 备份文件');
  const rows = data.rounds.map(({ id: _id, ...rest }) => rest);
  await db.rounds.bulkAdd(rows);
  return rows.length;
}

export async function clearAll(): Promise<void> {
  await db.rounds.clear();
  await db.sessions.clear();
}

export function downloadText(filename: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
