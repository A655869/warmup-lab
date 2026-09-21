import { validateMap, type TrainingMap } from './types';

/** 场景加载器：加载 JSON 地图并校验，非法数据拒绝加载并报错（手册 §9.2） */
export async function loadMap(url: string): Promise<TrainingMap> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`地图加载失败：HTTP ${res.status}`);
  const data: unknown = await res.json();
  return validateMap(data);
}
