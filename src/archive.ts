// ============================================================
// 档案层：数据结构、localStorage 持久化与追加式变更（全项目唯一写口）
// 原则：只增不改——原记录与旧复测永远保留，新测绘追加为新版本。
// ============================================================

import {
  deriveStatus,
  type MeasureInput,
  type RecordLike,
  type RecheckLike,
} from "./algorithm";

/** 一次测绘录入（同一构件可有多版，新版不覆盖旧版） */
export interface ComponentRecord {
  id: string;
  building: string; // 建筑名称
  componentNo: string; // 构件编号
  species: string; // 树种
  jointType: string; // 榫型
  length: string; // 截面长 mm（原始录入）
  width: string; // 截面宽 mm（原始录入）
  crackDepth: string; // 裂缝深度 mm
  deformation: string; // 变形值 mm
  disposition: string; // 处置意见
  surveyor: string; // 录入人
  createdAt: number;
}

/** 一次复测：另一人填写的两次读数，结论依附当时的树种与榫型 */
export interface Recheck {
  id: string;
  componentKey: string;
  species: string;
  jointType: string;
  inspector: string; // 复测人（须与录入人不同）
  readings: [MeasureInput, MeasureInput];
  createdAt: number;
}

export interface Archive {
  records: ComponentRecord[];
  rechecks: Recheck[];
}

const STORAGE_KEY = "hxyfront-62013:archive:v1";

export function componentKey(building: string, componentNo: string): string {
  return `${building.trim()}::${componentNo.trim()}`;
}

export function recordLikeOf(r: ComponentRecord): RecordLike {
  return {
    species: r.species,
    jointType: r.jointType,
    measure: { length: r.length, width: r.width, deformation: r.deformation },
  };
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- 持久化 ----------

export function loadArchive(): Archive {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Archive;
      if (parsed && Array.isArray(parsed.records) && Array.isArray(parsed.rechecks)) {
        return parsed;
      }
    }
  } catch {
    // 存储不可用或数据损坏时回落到种子档案
  }
  return seedArchive();
}

export function saveArchive(a: Archive): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
  } catch {
    // 存储满或被禁用时静默失败，页面内数据仍可用
  }
}

// ---------- 变更（只增不改） ----------

export interface RecordDraft {
  building: string;
  componentNo: string;
  species: string;
  jointType: string;
  length: string;
  width: string;
  crackDepth: string;
  deformation: string;
  disposition: string;
  surveyor: string;
}

/** 录入：同构件再次录入时追加新版本，原记录保留 */
export function addRecord(
  a: Archive,
  draft: RecordDraft
): { archive: Archive; record: ComponentRecord; hadPrevious: boolean } {
  const key = componentKey(draft.building, draft.componentNo);
  const hadPrevious = a.records.some(
    (r) => componentKey(r.building, r.componentNo) === key
  );
  const record: ComponentRecord = { ...draft, id: uid(), createdAt: Date.now() };
  return { archive: { ...a, records: [...a.records, record] }, record, hadPrevious };
}

export interface RecheckDraft {
  componentKey: string;
  inspector: string;
  readings: [MeasureInput, MeasureInput];
}

/** 复测：仅待复测构件可登记，且复测人须与录入人不同 */
export function addRecheck(
  a: Archive,
  draft: RecheckDraft
): { ok: true; archive: Archive } | { ok: false; error: string } {
  const current = latestByKey(a).get(draft.componentKey);
  if (!current) return { ok: false, error: "未找到该构件的录入记录" };
  if (!draft.inspector.trim()) return { ok: false, error: "请填写复测人" };
  if (draft.inspector.trim() === current.surveyor.trim()) {
    return { ok: false, error: `复测须由另一人填写（录入人为 ${current.surveyor}）` };
  }
  const status = deriveStatus(recordLikeOf(current), rechecksOf(a, draft.componentKey));
  if (status.status !== "recheck") {
    return { ok: false, error: "该构件当前不在待复测状态，无需复测" };
  }
  const recheck: Recheck = {
    id: uid(),
    componentKey: draft.componentKey,
    species: current.species,
    jointType: current.jointType,
    inspector: draft.inspector.trim(),
    readings: draft.readings,
    createdAt: Date.now(),
  };
  return { ok: true, archive: { ...a, rechecks: [...a.rechecks, recheck] } };
}

// ---------- 查询 ----------

/** 每个构件的当前版本（createdAt 最大者） */
export function latestByKey(a: Archive): Map<string, ComponentRecord> {
  const map = new Map<string, ComponentRecord>();
  for (const r of a.records) {
    const key = componentKey(r.building, r.componentNo);
    const prev = map.get(key);
    if (!prev || prev.createdAt <= r.createdAt) map.set(key, r);
  }
  return map;
}

export function rechecksOf(a: Archive, key: string): RecheckLike[] {
  return a.rechecks.filter((r) => r.componentKey === key);
}

/** 某构件的完整历史：全部录入选版本 + 全部复测，均按时间倒序 */
export function historyOf(
  a: Archive,
  key: string
): { versions: ComponentRecord[]; rechecks: Recheck[] } {
  return {
    versions: a.records
      .filter((r) => componentKey(r.building, r.componentNo) === key)
      .sort((x, y) => y.createdAt - x.createdAt),
    rechecks: a.rechecks
      .filter((r) => r.componentKey === key)
      .sort((x, y) => y.createdAt - x.createdAt),
  };
}

// ---------- 种子档案（首次打开时演示用，之后以本机存储为准） ----------

function seedArchive(): Archive {
  const t = Date.now();
  let seq = 0;
  const rec = (
    building: string,
    componentNo: string,
    species: string,
    jointType: string,
    length: string,
    width: string,
    crackDepth: string,
    deformation: string,
    disposition: string,
    surveyor: string
  ): ComponentRecord => ({
    id: `seed-r${++seq}`,
    building,
    componentNo,
    species,
    jointType,
    length,
    width,
    crackDepth,
    deformation,
    disposition,
    surveyor,
    createdAt: t - (100 - seq) * 60000,
  });
  const chk = (
    key: string,
    species: string,
    jointType: string,
    inspector: string,
    r1: MeasureInput,
    r2: MeasureInput
  ): Recheck => ({
    id: `seed-c${++seq}`,
    componentKey: key,
    species,
    jointType,
    inspector,
    readings: [r1, r2],
    createdAt: t - (100 - seq) * 60000,
  });

  const records: ComponentRecord[] = [
    // 直放：变形 9 ≤ 短边 180 的十分之一 18
    rec("万寿寺大殿", "梁架A-03", "楠木", "透榫", "180", "240", "12", "9", "清缝后回装", "张测"),
    // 初测变形 25 > 20，复测两次合格 → 复测放行
    rec("万寿寺大殿", "檐柱C-12", "杉木", "箍头榫", "200", "200", "30", "25", "建议局部墩接", "张测"),
    // 长宽非正整数 → 待复测
    rec("万寿寺大殿", "斗拱D-07", "松木", "半榫", "120.5", "160", "5", "6", "继续监测", "张测"),
    // 初测变形 20 > 15，复测合格后，树种由柏木改为榆木 → 旧结论失效，重回待复测
    rec("文殊殿", "额枋E-05", "柏木", "燕尾榫", "150", "150", "8", "20", "剔补后回装", "张测"),
    rec("文殊殿", "雀替Q-01", "楠木", "半榫", "90", "120", "2", "3", "直接回装", "王录"),
    rec("文殊殿", "额枋E-05", "榆木", "燕尾榫", "150", "150", "8", "20", "树种存疑，复核后定", "张测"),
  ];
  const rechecks: Recheck[] = [
    chk(
      componentKey("万寿寺大殿", "檐柱C-12"),
      "杉木",
      "箍头榫",
      "李复",
      { length: "200", width: "200", deformation: "18" },
      { length: "198", width: "200", deformation: "19" }
    ),
    chk(
      componentKey("文殊殿", "额枋E-05"),
      "柏木",
      "燕尾榫",
      "李复",
      { length: "150", width: "150", deformation: "12" },
      { length: "150", width: "150", deformation: "14" }
    ),
  ];
  return { records, rechecks };
}
