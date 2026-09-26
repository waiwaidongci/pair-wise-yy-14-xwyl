// ============================================================
// 档案层：体检档案的存放与持久化只写在这一处。
// 原则：档案只增不改——任何新测定都追加一条记录，原记录不被覆盖；
// 关闭页面再打开，历史从 localStorage 原样找回。
// ============================================================

import type { ArchiveRecord } from "./algorithm";

export interface Archive {
  version: 1;
  records: ArchiveRecord[];
}

const STORAGE_KEY = "hxyfront-62013:体检放行台:v1";

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 打开页面时取档：无存档则建样例档案 */
export function loadArchive(): Archive {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Archive;
      if (parsed && Array.isArray(parsed.records)) return parsed;
    }
  } catch {
    // 数据损坏时回落到样例档案
  }
  const seeded = seedArchive();
  saveArchive(seeded);
  return seeded;
}

export function saveArchive(a: Archive): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
  } catch {
    // 存储不可用时仅保留内存态
  }
}

/** 追加一条测定记录（初测/更正/复测），立即落档 */
export function appendRecord(a: Archive, r: ArchiveRecord): Archive {
  const next: Archive = { ...a, records: [...a.records, r] };
  saveArchive(next);
  return next;
}

/** 清空并恢复样例档案 */
export function resetArchive(): Archive {
  const seeded = seedArchive();
  saveArchive(seeded);
  return seeded;
}

function seedArchive(): Archive {
  const records: ArchiveRecord[] = [
    {
      kind: "initial",
      id: "seed-01",
      building: "配殿",
      componentNo: "梁-01",
      inspector: "张工",
      createdAt: "2026-09-17T15:00:00+08:00",
      species: "杉木",
      jointType: "透榫",
      reading: { lengthMm: 220, widthMm: 160, crackDepthMm: 9, deformMm: 10 },
      disposition: "按杉木登记，待复测",
    },
    {
      kind: "initial",
      id: "seed-02",
      building: "正殿",
      componentNo: "梁-03",
      inspector: "张工",
      createdAt: "2026-09-18T09:20:00+08:00",
      species: "杉木",
      jointType: "燕尾榫",
      reading: { lengthMm: 240, widthMm: 180, crackDepthMm: 12, deformMm: 15 },
      disposition: "节点完好，回装前复查榫肩",
    },
    {
      kind: "initial",
      id: "seed-03",
      building: "正殿",
      componentNo: "柱-12",
      inspector: "张工",
      createdAt: "2026-09-18T09:40:00+08:00",
      species: "柏木",
      jointType: "管脚榫",
      reading: { lengthMm: 260, widthMm: 260, crackDepthMm: 30, deformMm: 30 },
      disposition: "柱脚沉降待查，复测后再定",
    },
    {
      kind: "initial",
      id: "seed-04",
      building: "正殿",
      componentNo: "枋-07",
      inspector: "张工",
      createdAt: "2026-09-18T10:10:00+08:00",
      species: "松木",
      jointType: "半榫",
      reading: { lengthMm: 160, widthMm: 120.5, crackDepthMm: 6, deformMm: 8 },
      disposition: "截面毛料未刨净，宽度待复测核实",
    },
    {
      kind: "retest",
      id: "seed-05",
      building: "配殿",
      componentNo: "梁-01",
      inspector: "王工",
      createdAt: "2026-09-18T11:00:00+08:00",
      species: "杉木",
      jointType: "透榫",
      readings: [
        { lengthMm: 220, widthMm: 160, crackDepthMm: 9, deformMm: 11 },
        { lengthMm: 219, widthMm: 160, crackDepthMm: 10, deformMm: 12 },
      ],
      disposition: "两次读数一致，同意回装",
    },
    {
      kind: "retest",
      id: "seed-06",
      building: "正殿",
      componentNo: "梁-03",
      inspector: "李工",
      createdAt: "2026-09-19T10:05:00+08:00",
      species: "杉木",
      jointType: "燕尾榫",
      readings: [
        { lengthMm: 240, widthMm: 180, crackDepthMm: 12, deformMm: 14 },
        { lengthMm: 241, widthMm: 180, crackDepthMm: 11, deformMm: 15 },
      ],
      disposition: "两次读数均合格，同意回装",
    },
    {
      kind: "retest",
      id: "seed-07",
      building: "正殿",
      componentNo: "枋-07",
      inspector: "王工",
      createdAt: "2026-09-19T14:30:00+08:00",
      species: "松木",
      jointType: "半榫",
      readings: [
        { lengthMm: 160, widthMm: 120, crackDepthMm: 6, deformMm: 9 },
        { lengthMm: 160, widthMm: 121, crackDepthMm: 7, deformMm: 14 },
      ],
      disposition: "读数二变形超限，安排再次复测",
    },
    {
      kind: "initial",
      id: "seed-08",
      building: "配殿",
      componentNo: "斗拱-02",
      inspector: "李工",
      createdAt: "2026-09-20T08:50:00+08:00",
      species: "楠木",
      jointType: "馒头榫",
      reading: { lengthMm: 130, widthMm: 90, crackDepthMm: 4, deformMm: 6 },
      disposition: "保存完好，待复测确认",
    },
    {
      kind: "initial",
      id: "seed-09",
      building: "配殿",
      componentNo: "梁-01",
      inspector: "李工",
      createdAt: "2026-09-21T09:30:00+08:00",
      species: "松木",
      jointType: "透榫",
      reading: { lengthMm: 220, widthMm: 160, crackDepthMm: 9, deformMm: 10 },
      disposition: "树种复核为松木，原结论失效，需重新复测",
    },
  ];
  return { version: 1, records };
}
