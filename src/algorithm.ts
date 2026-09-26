// ============================================================
// 算法层：体检判定规则（全项目唯一实现处，界面与档案都从这里取结论）
// ============================================================

/** 一次量测的原始读数（保留录入原样，判定在这里做） */
export interface MeasureInput {
  length: string; // 截面长 mm
  width: string; // 截面宽 mm
  deformation: string; // 变形值 mm
}

export interface CheckResult {
  ok: boolean; // 本次量测是否合格
  dimOk: boolean; // 长宽均为正整数
  deformOk: boolean; // 变形未超过短边十分之一
  shortSide: number | null; // 短边 mm（长宽合格时才有）
  limit: number | null; // 放行限值 = 短边 / 10
  problems: string[]; // 不合格原因
}

/** 正整数判定：只接受纯数字且大于 0（180.5、0、-3、空串均不算） */
export function isPositiveInteger(raw: string): boolean {
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return false;
  return Number(t) > 0;
}

/** 单次量测判定：长宽须为正整数，且变形 ≤ 短边十分之一 */
export function checkMeasure(m: MeasureInput): CheckResult {
  const dimOk = isPositiveInteger(m.length) && isPositiveInteger(m.width);
  const deformRaw = m.deformation.trim();
  const deform = Number(deformRaw);
  const deformValid = deformRaw !== "" && Number.isFinite(deform) && deform >= 0;

  let shortSide: number | null = null;
  let limit: number | null = null;
  if (dimOk) {
    shortSide = Math.min(Number(m.length.trim()), Number(m.width.trim()));
    limit = shortSide / 10;
  }
  const deformOk = deformValid && limit !== null && deform <= limit;

  const problems: string[] = [];
  if (!dimOk) problems.push("截面长宽须为正整数");
  if (!deformValid) problems.push("变形值须为不小于 0 的数");
  if (dimOk && deformValid && !deformOk) {
    problems.push(`变形 ${deform}mm 超过短边 ${shortSide}mm 的十分之一（${limit}mm）`);
  }

  return { ok: dimOk && deformOk, dimOk, deformOk, shortSide, limit, problems };
}

/** 复测结论所依附的树种与榫型（改动即失效） */
export interface ConclusionBasis {
  species: string;
  jointType: string;
}

export interface RecheckLike extends ConclusionBasis {
  readings: [MeasureInput, MeasureInput];
}

export interface RecordLike extends ConclusionBasis {
  measure: MeasureInput;
}

/** 两次读数各自合格，复测才算通过 */
export function recheckPassed(readings: MeasureInput[]): boolean {
  return readings.length === 2 && readings.every((r) => checkMeasure(r).ok);
}

/** 旧结论是否仍然有效：树种、榫型都未改动才有效 */
export function conclusionHolds(recheck: ConclusionBasis, record: ConclusionBasis): boolean {
  return recheck.species === record.species && recheck.jointType === record.jointType;
}

export type Status = "pass" | "recheck";

export interface StatusResult {
  status: Status;
  via: "initial" | "recheck" | null; // 放行依据：直放 / 复测放行
  initial: CheckResult; // 当前记录自身的判定
  invalidCount: number; // 因树种/榫型改动而失效的旧结论数
  attempts: number; // 仍有效的复测次数
}

/**
 * 推导构件当前状态：
 * 1. 当前记录自身合格 → 直放可回装；
 * 2. 否则看挂在同一树种+榫型下的复测，有两次皆合格的 → 复测放行；
 * 3. 都没有 → 留在待复测。
 */
export function deriveStatus(record: RecordLike, rechecks: RecheckLike[]): StatusResult {
  const initial = checkMeasure(record.measure);
  const valid = rechecks.filter((r) => conclusionHolds(r, record));
  const result: StatusResult = {
    status: "recheck",
    via: null,
    initial,
    invalidCount: rechecks.length - valid.length,
    attempts: valid.length,
  };
  if (initial.ok) {
    result.status = "pass";
    result.via = "initial";
  } else if (valid.some((r) => recheckPassed(r.readings))) {
    result.status = "pass";
    result.via = "recheck";
  }
  return result;
}
