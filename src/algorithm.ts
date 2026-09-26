// ============================================================
// 算法层：体检放行判定规则只写在这一处，界面与档案不得另写规则。
// ============================================================

/** 单次读数：截面长宽、裂缝深度、变形值（单位 mm） */
export interface Reading {
  lengthMm: number;
  widthMm: number;
  crackDepthMm: number;
  deformMm: number;
}

/** 初测 / 更正测定记录（追加式，原记录不被覆盖） */
export interface InitialRecord {
  kind: "initial";
  id: string;
  building: string;
  componentNo: string;
  inspector: string;
  createdAt: string;
  species: string;
  jointType: string;
  reading: Reading;
  disposition: string;
}

/** 复测记录：另一人填写，同一构件两次读数 */
export interface RetestRecord {
  kind: "retest";
  id: string;
  building: string;
  componentNo: string;
  inspector: string;
  createdAt: string;
  species: string;
  jointType: string;
  readings: [Reading, Reading];
  disposition: string;
}

export type ArchiveRecord = InitialRecord | RetestRecord;

export interface Verdict {
  pass: boolean;
  reasons: string[];
}

export type Status = "待复测" | "可回装";

/** 一个构件的全部档案（按时间先后排列，只增不改） */
export interface ComponentFile {
  building: string;
  componentNo: string;
  records: ArchiveRecord[];
}

export interface Conclusion {
  status: Status;
  species: string;
  jointType: string;
  /** 当前有效尺寸（最新有效记录） */
  basis: Reading | null;
  /** 树种或榫型改动过，此前结论已失效 */
  invalidated: boolean;
  initialVerdict: Verdict | null;
  retestVerdicts: [Verdict, Verdict] | null;
  notes: string[];
  /** records 中有效段起点下标，之前的记录均已失效 */
  validFrom: number;
}

export function componentKey(building: string, componentNo: string): string {
  return `${building}||${componentNo}`;
}

export function isPositiveInteger(n: number): boolean {
  return Number.isInteger(n) && n > 0;
}

export function shortSideOf(r: Reading): number {
  return Math.min(r.lengthMm, r.widthMm);
}

/** 变形限值 = 短边十分之一 */
export function deformLimitOf(r: Reading): number {
  return shortSideOf(r) / 10;
}

/**
 * 单次读数判定：
 *  - 截面长宽须为正整数；
 *  - 变形值不得超过短边十分之一。
 * 任一不满足即留在待复测。
 */
export function judgeReading(r: Reading): Verdict {
  const reasons: string[] = [];
  const dimsOk = isPositiveInteger(r.lengthMm) && isPositiveInteger(r.widthMm);
  if (!dimsOk) {
    reasons.push("截面长宽须为正整数");
  }
  if (dimsOk && r.deformMm > deformLimitOf(r)) {
    reasons.push(`变形${r.deformMm}mm超过短边十分之一（限${deformLimitOf(r)}mm）`);
  }
  return { pass: reasons.length === 0, reasons };
}

/**
 * 构件结论推导：
 *  - 树种或榫型一改，旧结论失效：有效段只取与最新记录同树种、同榫型的尾部；
 *  - 复测须晚于最近一次初测（更正后须重新复测）；
 *  - 复测两次读数均合格才进入可回装清单，否则留在待复测。
 */
export function conclude(file: ComponentFile): Conclusion {
  const records = file.records;
  const last = records[records.length - 1];
  const species = last.species;
  const jointType = last.jointType;

  let validFrom = records.length - 1;
  while (
    validFrom > 0 &&
    records[validFrom - 1].species === species &&
    records[validFrom - 1].jointType === jointType
  ) {
    validFrom--;
  }
  const invalidated = validFrom > 0;

  let latestInitialIdx = -1;
  let latestRetestIdx = -1;
  for (let i = validFrom; i < records.length; i++) {
    if (records[i].kind === "initial") latestInitialIdx = i;
    else latestRetestIdx = i;
  }
  const latestInitial =
    latestInitialIdx >= 0 ? (records[latestInitialIdx] as InitialRecord) : null;
  const retest =
    latestRetestIdx > latestInitialIdx
      ? (records[latestRetestIdx] as RetestRecord)
      : null;

  const initialVerdict = latestInitial ? judgeReading(latestInitial.reading) : null;
  const retestVerdicts: [Verdict, Verdict] | null = retest
    ? [judgeReading(retest.readings[0]), judgeReading(retest.readings[1])]
    : null;

  const notes: string[] = [];
  let status: Status = "待复测";
  if (retestVerdicts && retest) {
    if (retestVerdicts.every((v) => v.pass)) {
      status = "可回装";
      notes.push(`复测人${retest.inspector}两次读数均合格，准予回装`);
    } else {
      retestVerdicts.forEach((v, i) => {
        v.reasons.forEach((r) => notes.push(`复测读数${i === 0 ? "一" : "二"}：${r}`));
      });
      notes.push("两次读数均合格才可回装，仍留待复测");
    }
  } else if (initialVerdict) {
    if (initialVerdict.pass) {
      notes.push("初测合格，待另一人复测确认");
    } else {
      initialVerdict.reasons.forEach((r) => notes.push(`初测：${r}`));
    }
  }
  if (invalidated) {
    notes.unshift("树种或榫型有改动，此前结论已失效");
  }

  const basis = retest ? retest.readings[1] : latestInitial ? latestInitial.reading : null;

  return {
    status,
    species,
    jointType,
    basis,
    invalidated,
    initialVerdict,
    retestVerdicts,
    notes,
    validFrom,
  };
}

/** 待复测中是否带指标异常（用于标记） */
export function hasIssue(c: Conclusion): boolean {
  if (c.status === "可回装") return false;
  if (c.retestVerdicts) return c.retestVerdicts.some((v) => !v.pass);
  return c.initialVerdict ? !c.initialVerdict.pass : false;
}

/** 复测门槛：须由另一人填写（与最近一次初测人不同）。返回 null 表示可提交。 */
export function retestGate(file: ComponentFile, inspector: string): string | null {
  const name = inspector.trim();
  if (!name) return "请填写复测人";
  const initials = file.records.filter(
    (r): r is InitialRecord => r.kind === "initial"
  );
  const lastInitial = initials[initials.length - 1];
  if (lastInitial && lastInitial.inspector.trim() === name) {
    return `复测须由另一人填写（初测人：${lastInitial.inspector}）`;
  }
  return null;
}

/** 按 建筑+构件编号 归集档案 */
export function groupByComponent(records: ArchiveRecord[]): ComponentFile[] {
  const map = new Map<string, ComponentFile>();
  for (const r of records) {
    const key = componentKey(r.building, r.componentNo);
    let f = map.get(key);
    if (!f) {
      f = { building: r.building, componentNo: r.componentNo, records: [] };
      map.set(key, f);
    }
    f.records.push(r);
  }
  return [...map.values()];
}

export interface Filter {
  building: string;
  jointType: string;
  species: string;
  status: string;
  query: string;
}

export const EMPTY_FILTER: Filter = {
  building: "",
  jointType: "",
  species: "",
  status: "",
  query: "",
};

/** 清单、剖面标记、关联图共用同一套筛查条件 */
export function matchFilter(file: ComponentFile, c: Conclusion, f: Filter): boolean {
  if (f.building && file.building !== f.building) return false;
  if (f.jointType && c.jointType !== f.jointType) return false;
  if (f.species && c.species !== f.species) return false;
  if (f.status && c.status !== f.status) return false;
  const q = f.query.trim().toLowerCase();
  if (q && !`${file.building}${file.componentNo}`.toLowerCase().includes(q)) {
    return false;
  }
  return true;
}
