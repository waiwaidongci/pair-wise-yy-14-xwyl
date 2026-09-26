// ============================================================
// 界面层：体检放行台（判定规则见 algorithm.ts，存储与变更见 archive.ts）
// ============================================================

import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import {
  checkMeasure,
  conclusionHolds,
  deriveStatus,
  recheckPassed,
  type MeasureInput,
  type StatusResult,
} from "./algorithm";
import {
  addRecheck,
  addRecord,
  componentKey,
  historyOf,
  latestByKey,
  loadArchive,
  recordLikeOf,
  rechecksOf,
  saveArchive,
  type Archive,
  type ComponentRecord,
} from "./archive";

const SPECIES = ["楠木", "杉木", "松木", "柏木", "榆木", "樟木"];
const JOINT_TYPES = ["燕尾榫", "透榫", "半榫", "箍头榫", "馒头榫", "管脚榫"];
const DISPOSITIONS = ["清缝后回装", "直接回装", "局部剔补", "墩接", "更换", "继续监测"];

interface Row {
  key: string;
  rec: ComponentRecord;
  st: StatusResult;
}

interface EntryForm {
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

const emptyEntry: EntryForm = {
  building: "",
  componentNo: "",
  species: SPECIES[0],
  jointType: JOINT_TYPES[1],
  length: "",
  width: "",
  crackDepth: "",
  deformation: "",
  disposition: "",
  surveyor: "",
};

const emptyReading = (): MeasureInput => ({ length: "", width: "", deformation: "" });

interface RecheckForm {
  key: string;
  inspector: string;
  r1: MeasureInput;
  r2: MeasureInput;
}

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleString("zh-CN", { hour12: false });

const viaText = (st: StatusResult) =>
  st.via === "initial" ? "直放" : st.via === "recheck" ? "复测放行" : "—";

function StatusBadge({ st }: { st: StatusResult }) {
  return st.status === "pass" ? (
    <span className="badge pass">可回装</span>
  ) : (
    <span className="badge recheck">待复测</span>
  );
}

function App() {
  const [archive, setArchive] = useState<Archive>(loadArchive);
  useEffect(() => saveArchive(archive), [archive]);

  // 联动筛查条件：清单、剖面标记、关联图共用
  const [fBuilding, setFBuilding] = useState("all");
  const [fJoint, setFJoint] = useState("all");
  const [fStatus, setFStatus] = useState<"all" | "pass" | "recheck">("all");
  const [fKeyword, setFKeyword] = useState("");
  const [selKey, setSelKey] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [entry, setEntry] = useState<EntryForm>(emptyEntry);
  const [rc, setRc] = useState<RecheckForm>({ key: "", inspector: "", r1: emptyReading(), r2: emptyReading() });

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 9000);
    return () => clearTimeout(t);
  }, [msg]);

  const rows: Row[] = useMemo(() => {
    return [...latestByKey(archive).entries()]
      .map(([key, rec]) => ({
        key,
        rec,
        st: deriveStatus(recordLikeOf(rec), rechecksOf(archive, key)),
      }))
      .sort(
        (a, b) =>
          a.rec.building.localeCompare(b.rec.building, "zh") ||
          a.rec.componentNo.localeCompare(b.rec.componentNo, "zh")
      );
  }, [archive]);

  const buildings = useMemo(
    () => [...new Set(archive.records.map((r) => r.building))],
    [archive]
  );
  const jointTypes = useMemo(
    () => [...new Set(archive.records.map((r) => r.jointType))],
    [archive]
  );

  const kw = fKeyword.trim();
  const filtered = rows.filter(
    (r) =>
      (fBuilding === "all" || r.rec.building === fBuilding) &&
      (fJoint === "all" || r.rec.jointType === fJoint) &&
      (fStatus === "all" || r.st.status === fStatus) &&
      (kw === "" ||
        [r.rec.building, r.rec.componentNo, r.rec.species, r.rec.disposition].some((s) =>
          s.includes(kw)
        ))
  );

  const metrics = useMemo(
    () => ({
      total: rows.length,
      pass: rows.filter((r) => r.st.status === "pass").length,
      recheck: rows.filter((r) => r.st.status === "recheck").length,
      invalid: rows.reduce((n, r) => n + r.st.invalidCount, 0),
    }),
    [rows]
  );

  const recheckTargets = rows.filter((r) => r.st.status === "recheck");
  const rcTarget = rows.find((r) => r.key === rc.key) ?? null;

  const setE = (patch: Partial<EntryForm>) => setEntry((p) => ({ ...p, ...patch }));
  const setReading = (which: "r1" | "r2", patch: Partial<MeasureInput>) =>
    setRc((p) => ({ ...p, [which]: { ...p[which], ...patch } }));

  const submitEntry = () => {
    const missing = (
      [
        ["建筑名称", entry.building],
        ["构件编号", entry.componentNo],
        ["截面长", entry.length],
        ["截面宽", entry.width],
        ["裂缝深度", entry.crackDepth],
        ["变形值", entry.deformation],
        ["处置意见", entry.disposition],
        ["录入人", entry.surveyor],
      ] as const
    )
      .filter(([, v]) => !v.trim())
      .map(([k]) => k);
    if (missing.length) {
      setMsg({ kind: "err", text: `请填写完整：${missing.join("、")}` });
      return;
    }
    const { archive: next, record, hadPrevious } = addRecord(archive, {
      building: entry.building.trim(),
      componentNo: entry.componentNo.trim(),
      species: entry.species,
      jointType: entry.jointType,
      length: entry.length.trim(),
      width: entry.width.trim(),
      crackDepth: entry.crackDepth.trim(),
      deformation: entry.deformation.trim(),
      disposition: entry.disposition.trim(),
      surveyor: entry.surveyor.trim(),
    });
    setArchive(next);
    const check = checkMeasure({
      length: record.length,
      width: record.width,
      deformation: record.deformation,
    });
    const verdict = check.ok
      ? `判定合格（短边 ${check.shortSide}mm，限值 ${check.limit}mm），直入可回装清单`
      : `${check.problems.join("；")}，留在待复测`;
    setMsg({
      kind: check.ok ? "ok" : "err",
      text: `${record.building} / ${record.componentNo} 已录入：${verdict}${
        hadPrevious ? "。原记录已保留为历史版本，未被覆盖" : ""
      }`,
    });
    setEntry({ ...emptyEntry, building: record.building, surveyor: record.surveyor });
    setSelKey(componentKey(record.building, record.componentNo));
  };

  const submitRecheck = () => {
    if (!rc.key) {
      setMsg({ kind: "err", text: "请选择待复测构件" });
      return;
    }
    const labels = ["读数一", "读数二"];
    const readings = [rc.r1, rc.r2];
    for (let i = 0; i < 2; i++) {
      const r = readings[i];
      if (!r.length.trim() || !r.width.trim() || !r.deformation.trim()) {
        setMsg({ kind: "err", text: `请填写完整的${labels[i]}（长、宽、变形）` });
        return;
      }
    }
    const res = addRecheck(archive, {
      componentKey: rc.key,
      inspector: rc.inspector,
      readings: [rc.r1, rc.r2],
    });
    if (!res.ok) {
      setMsg({ kind: "err", text: res.error });
      return;
    }
    setArchive(res.archive);
    const passed = recheckPassed([rc.r1, rc.r2]);
    const detail = [rc.r1, rc.r2]
      .map((r, i) => {
        const c = checkMeasure(r);
        return `${labels[i]}${c.ok ? "合格" : `不合格（${c.problems.join("；")}）`}`;
      })
      .join("，");
    setMsg({
      kind: passed ? "ok" : "err",
      text: `${rcTarget ? `${rcTarget.rec.building} / ${rcTarget.rec.componentNo} ` : ""}复测已登记：${detail}。${
        passed ? "两次皆合格，进入可回装清单" : "未达两次合格，仍留在待复测"
      }`,
    });
    setRc({ key: "", inspector: "", r1: emptyReading(), r2: emptyReading() });
  };

  const exportCsv = () => {
    const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const head = [
      "建筑", "构件编号", "树种", "榫型", "截面长mm", "截面宽mm", "裂缝mm",
      "变形mm", "短边mm", "限值mm", "状态", "放行依据", "处置意见", "录入人", "录入时间",
    ];
    const lines = filtered.map(({ rec, st }) =>
      [
        rec.building, rec.componentNo, rec.species, rec.jointType, rec.length, rec.width,
        rec.crackDepth, rec.deformation, st.initial.shortSide ?? "", st.initial.limit ?? "",
        st.status === "pass" ? "可回装" : "待复测", viaText(st),
        rec.disposition, rec.surveyor, fmtTime(rec.createdAt),
      ]
        .map(q)
        .join(",")
    );
    const blob = new Blob(["﻿" + [head.map(q).join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "体检放行清单.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setFBuilding("all");
    setFJoint("all");
    setFStatus("all");
    setFKeyword("");
  };

  const toggleSelect = (key: string) => setSelKey((p) => (p === key ? null : key));

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62013 · 落架前体检放行台 · Port 62013</p>
        <h1>木构件体检放行台</h1>
        <span>
          落架前逐件体检：按建筑与构件编号录入树种、榫型、截面长宽、裂缝深度、变形值与处置意见。
          长宽非正整数、或变形超过短边十分之一的构件留在待复测，原记录不被覆盖；
          复测须由另一人填写两次读数，两次皆合格才进入可回装清单；树种或榫型一改，旧结论即失效。
          档案保存在本机浏览器，关闭页面再打开，历史仍能找回。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>在册构件</small>
          <strong>{metrics.total}</strong>
        </article>
        <article className="m-pass">
          <small>可回装</small>
          <strong>{metrics.pass}</strong>
        </article>
        <article className="m-recheck">
          <small>待复测</small>
          <strong>{metrics.recheck}</strong>
        </article>
        <article className="m-invalid">
          <small>失效结论</small>
          <strong>{metrics.invalid}</strong>
        </article>
      </section>

      {msg && <div className={`toast ${msg.kind}`}>{msg.text}</div>}

      <section className="panel">
        <div className="heading">
          <div>
            <p>联动筛查</p>
            <h2>清单、剖面标记与关联图共同收窄</h2>
          </div>
          <button onClick={resetFilters}>清除筛选</button>
        </div>
        <div className="filter-bar">
          <label>
            <span>建筑</span>
            <select value={fBuilding} onChange={(e) => setFBuilding(e.target.value)}>
              <option value="all">全部建筑</option>
              {buildings.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </label>
          <label>
            <span>状态</span>
            <select
              value={fStatus}
              onChange={(e) => setFStatus(e.target.value as "all" | "pass" | "recheck")}
            >
              <option value="all">全部状态</option>
              <option value="pass">可回装</option>
              <option value="recheck">待复测</option>
            </select>
          </label>
          <label className="kw">
            <span>关键词</span>
            <input
              value={fKeyword}
              onChange={(e) => setFKeyword(e.target.value)}
              placeholder="编号 / 树种 / 处置意见"
            />
          </label>
          <div className="chips joint-chips">
            <button className={fJoint === "all" ? "on" : ""} onClick={() => setFJoint("all")}>
              全部榫型
            </button>
            {jointTypes.map((j) => (
              <button
                key={j}
                className={fJoint === j ? "on" : ""}
                onClick={() => setFJoint(fJoint === j ? "all" : j)}
              >
                {j}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="workspace">
        <div className="panel form-panel">
          <div className="heading">
            <div>
              <p>测绘录入</p>
              <h2>按建筑与构件编号登记</h2>
            </div>
            <button className="primary" onClick={submitEntry}>保存记录</button>
          </div>
          <div className="field-grid">
            <label>
              <span>建筑名称</span>
              <input
                list="dl-buildings"
                value={entry.building}
                onChange={(e) => setE({ building: e.target.value })}
                placeholder="如：万寿寺大殿"
              />
            </label>
            <label>
              <span>构件编号</span>
              <input
                value={entry.componentNo}
                onChange={(e) => setE({ componentNo: e.target.value })}
                placeholder="如：梁架A-03"
              />
            </label>
            <label>
              <span>树种</span>
              <select value={entry.species} onChange={(e) => setE({ species: e.target.value })}>
                {SPECIES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              <span>榫型</span>
              <select value={entry.jointType} onChange={(e) => setE({ jointType: e.target.value })}>
                {JOINT_TYPES.map((j) => (
                  <option key={j} value={j}>{j}</option>
                ))}
              </select>
            </label>
            <label>
              <span>截面长（mm，正整数）</span>
              <input
                inputMode="numeric"
                value={entry.length}
                onChange={(e) => setE({ length: e.target.value })}
                placeholder="如：180"
              />
            </label>
            <label>
              <span>截面宽（mm，正整数）</span>
              <input
                inputMode="numeric"
                value={entry.width}
                onChange={(e) => setE({ width: e.target.value })}
                placeholder="如：240"
              />
            </label>
            <label>
              <span>裂缝深度（mm）</span>
              <input
                inputMode="decimal"
                value={entry.crackDepth}
                onChange={(e) => setE({ crackDepth: e.target.value })}
                placeholder="如：12"
              />
            </label>
            <label>
              <span>变形值（mm，≤ 短边 1/10）</span>
              <input
                inputMode="decimal"
                value={entry.deformation}
                onChange={(e) => setE({ deformation: e.target.value })}
                placeholder="如：9"
              />
            </label>
            <label>
              <span>处置意见</span>
              <input
                list="dl-dispositions"
                value={entry.disposition}
                onChange={(e) => setE({ disposition: e.target.value })}
                placeholder="如：清缝后回装"
              />
            </label>
            <label>
              <span>录入人</span>
              <input
                value={entry.surveyor}
                onChange={(e) => setE({ surveyor: e.target.value })}
                placeholder="姓名"
              />
            </label>
          </div>
          <datalist id="dl-buildings">
            {buildings.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
          <datalist id="dl-dispositions">
            {DISPOSITIONS.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
          <p className="hint">
            同一构件再次录入时追加为新版本，原记录保留为历史；改动树种或榫型会使旧复测结论失效。
          </p>
        </div>

        <div className="panel form-panel">
          <div className="heading">
            <div>
              <p>复测登记</p>
              <h2>另一人填写两次读数</h2>
            </div>
            <button
              className="primary"
              onClick={submitRecheck}
              disabled={recheckTargets.length === 0}
            >
              登记复测
            </button>
          </div>
          {recheckTargets.length === 0 ? (
            <p className="hint">当前没有待复测构件。</p>
          ) : (
            <>
              <div className="field-grid">
                <label>
                  <span>待复测构件</span>
                  <select value={rc.key} onChange={(e) => setRc((p) => ({ ...p, key: e.target.value }))}>
                    <option value="">请选择</option>
                    {recheckTargets.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.rec.building} / {r.rec.componentNo}（录入人：{r.rec.surveyor}）
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>复测人（须非录入人）</span>
                  <input
                    value={rc.inspector}
                    onChange={(e) => setRc((p) => ({ ...p, inspector: e.target.value }))}
                    placeholder="姓名"
                  />
                </label>
              </div>
              {rcTarget && (
                <p className="hint warn">
                  初测问题：{rcTarget.st.initial.problems.join("；")}
                </p>
              )}
              <div className="reading-pair">
                <fieldset>
                  <legend>读数一</legend>
                  <label>
                    <span>长 mm</span>
                    <input
                      inputMode="numeric"
                      value={rc.r1.length}
                      onChange={(e) => setReading("r1", { length: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>宽 mm</span>
                    <input
                      inputMode="numeric"
                      value={rc.r1.width}
                      onChange={(e) => setReading("r1", { width: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>变形 mm</span>
                    <input
                      inputMode="decimal"
                      value={rc.r1.deformation}
                      onChange={(e) => setReading("r1", { deformation: e.target.value })}
                    />
                  </label>
                </fieldset>
                <fieldset>
                  <legend>读数二</legend>
                  <label>
                    <span>长 mm</span>
                    <input
                      inputMode="numeric"
                      value={rc.r2.length}
                      onChange={(e) => setReading("r2", { length: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>宽 mm</span>
                    <input
                      inputMode="numeric"
                      value={rc.r2.width}
                      onChange={(e) => setReading("r2", { width: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>变形 mm</span>
                    <input
                      inputMode="decimal"
                      value={rc.r2.deformation}
                      onChange={(e) => setReading("r2", { deformation: e.target.value })}
                    />
                  </label>
                </fieldset>
              </div>
              <p className="hint">
                两次读数各自满足「长宽为正整数且变形 ≤ 短边十分之一」，构件才进入可回装清单。
              </p>
            </>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>构件清单</p>
            <h2>可回装清单与待复测（{filtered.length} / {rows.length}）</h2>
          </div>
          <button onClick={exportCsv}>导出CSV</button>
        </div>
        <div className="list-scroll">
          <div className="list-row list-head">
            <span>状态</span>
            <span>构件</span>
            <span>树种 · 榫型</span>
            <span>截面 mm</span>
            <span>裂缝</span>
            <span>变形 / 限值</span>
            <span>处置意见</span>
            <span>依据</span>
            <span></span>
          </div>
          {filtered.map((row) => (
            <div key={row.key}>
              <div
                className={`list-row item ${selKey === row.key ? "selected" : ""}`}
                onClick={() => toggleSelect(row.key)}
              >
                <span><StatusBadge st={row.st} /></span>
                <span>
                  <b>{row.rec.componentNo}</b>
                  <small>{row.rec.building}</small>
                </span>
                <span>
                  {row.rec.species} · {row.rec.jointType}
                  {row.st.invalidCount > 0 && (
                    <small className="invalid-note">{row.st.invalidCount} 条旧结论失效</small>
                  )}
                </span>
                <span>{row.rec.length} × {row.rec.width}</span>
                <span>{row.rec.crackDepth}mm</span>
                <span>
                  {row.rec.deformation} / {row.st.initial.limit ?? "—"}mm
                  {row.st.status === "recheck" && row.st.initial.problems.length > 0 && (
                    <small className="prob">{row.st.initial.problems[0]}</small>
                  )}
                </span>
                <span>{row.rec.disposition}</span>
                <span>{viaText(row.st)}</span>
                <span>
                  <button
                    className="mini"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenKey((p) => (p === row.key ? null : row.key));
                    }}
                  >
                    {openKey === row.key ? "收起" : "历史"}
                  </button>
                </span>
              </div>
              {openKey === row.key && <HistoryBlock archive={archive} row={row} />}
            </div>
          ))}
          {filtered.length === 0 && <p className="empty">无匹配构件，请调整筛查条件。</p>}
        </div>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>剖面标记</p>
            <h2>截面、裂缝与变形限值（{filtered.length}）</h2>
          </div>
        </div>
        {filtered.length === 0 ? (
          <p className="empty">无匹配构件。</p>
        ) : (
          <div className="section-grid">
            {filtered.map((row) => (
              <SectionCard
                key={row.key}
                row={row}
                selected={selKey === row.key}
                onSelect={() => toggleSelect(row.key)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>关联图</p>
            <h2>单栋建筑构件关系（同榫型相连）</h2>
          </div>
        </div>
        {filtered.length === 0 ? (
          <p className="empty">无匹配构件。</p>
        ) : (
          <div className="graphs">
            {Object.entries(
              filtered.reduce<Record<string, Row[]>>((acc, row) => {
                (acc[row.rec.building] ??= []).push(row);
                return acc;
              }, {})
            ).map(([building, rs]) => (
              <BuildingGraph
                key={building}
                building={building}
                rows={rs}
                selKey={selKey}
                onSelect={toggleSelect}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

/** 某构件的完整历史：录入选版本 + 复测登记（含失效标记） */
function HistoryBlock({ archive, row }: { archive: Archive; row: Row }) {
  const { versions, rechecks } = historyOf(archive, row.key);
  return (
    <div className="history">
      <div>
        <h4>录入选版本（{versions.length}）</h4>
        {versions.map((v, i) => (
          <p key={v.id}>
            <b className={i === 0 ? "tag current" : "tag"}>
              {i === 0 ? "当前" : `第${versions.length - i}版`}
            </b>
            {fmtTime(v.createdAt)} · {v.species} · {v.jointType} · 截面 {v.length}×{v.width}mm ·
            裂缝 {v.crackDepth}mm · 变形 {v.deformation}mm · {v.disposition} · 录入人 {v.surveyor}
          </p>
        ))}
      </div>
      <div>
        <h4>复测登记（{rechecks.length}）</h4>
        {rechecks.length === 0 && <p>暂无复测。</p>}
        {rechecks.map((c) => {
          const holds = conclusionHolds(c, row.rec);
          const passed = recheckPassed(c.readings);
          return (
            <p key={c.id}>
              <b className={`tag ${holds ? (passed ? "ok" : "bad") : "void"}`}>
                {holds ? (passed ? "两次合格" : "未通过") : "已失效"}
              </b>
              {fmtTime(c.createdAt)} · 复测人 {c.inspector} ·
              读数一 {c.readings[0].length}×{c.readings[0].width}mm 变形 {c.readings[0].deformation}mm ·
              读数二 {c.readings[1].length}×{c.readings[1].width}mm 变形 {c.readings[1].deformation}mm
              {!holds && `（结论依附 ${c.species}·${c.jointType}，树种或榫型已改动）`}
            </p>
          );
        })}
      </div>
    </div>
  );
}

/** 剖面标记：截面矩形 + 裂缝楔形 + 变形/限值仪表条 */
function SectionCard({
  row,
  selected,
  onSelect,
}: {
  row: Row;
  selected: boolean;
  onSelect: () => void;
}) {
  const { rec, st } = row;
  const len = Number(rec.length);
  const wid = Number(rec.width);
  const dimOk = st.initial.dimOk;
  const s = dimOk ? Math.min(140 / len, 100 / wid) : 0;
  const w = len * s;
  const h = wid * s;
  const x = 110 - w / 2;
  const y = 92 - h / 2;
  const crack = Number(rec.crackDepth);
  const crackOk = dimOk && Number.isFinite(crack) && crack > 0;
  const crackPx = crackOk ? Math.min(crack, Math.min(len, wid)) * s : 0;
  const deform = Number(rec.deformation);
  const limit = st.initial.limit;
  const deformValid = rec.deformation.trim() !== "" && Number.isFinite(deform) && deform >= 0;
  const ratio = limit !== null && deformValid ? deform / limit : 0;
  const over = limit !== null && deformValid && deform > limit;

  return (
    <button
      type="button"
      className={`section-card ${st.status} ${selected ? "selected" : ""}`}
      onClick={onSelect}
    >
      <div className="section-head">
        <strong>{rec.componentNo}</strong>
        <StatusBadge st={st} />
      </div>
      <svg viewBox="0 0 220 200" role="img" aria-label={`${rec.componentNo} 剖面标记`}>
        {dimOk ? (
          <>
            <rect className="sect-rect" x={x} y={y} width={w} height={h} />
            {crackOk && (
              <>
                <path
                  className="sect-crack"
                  d={`M ${x + w * 0.25} ${y} L ${x + w * 0.25 - 5} ${y + crackPx} L ${
                    x + w * 0.25 + 5
                  } ${y + crackPx} Z`}
                />
                <text className="sect-crack-label" x={x + 2} y={y - 5}>
                  裂{rec.crackDepth}mm
                </text>
              </>
            )}
          </>
        ) : (
          <>
            <rect className="sect-rect invalid" x={50} y={42} width={120} height={100} />
            <text className="sect-invalid" x={110} y={97}>
              截面待复测
            </text>
          </>
        )}
        <text className="sect-dim" x={110} y={158}>
          {rec.length || "?"} × {rec.width || "?"} mm
        </text>
        <rect className="gauge-bg" x={30} y={168} width={160} height={8} />
        {limit !== null && deformValid && (
          <rect
            className={`gauge-fill ${over ? "over" : ""}`}
            x={30}
            y={168}
            width={(Math.min(ratio, 1.5) / 1.5) * 160}
            height={8}
          />
        )}
        <text className="gauge-label" x={110} y={193}>
          变形 {rec.deformation || "—"}mm / 限 {limit ?? "—"}mm
        </text>
      </svg>
      <div className="section-foot">
        {rec.building} · {rec.species} · {rec.jointType}
      </div>
    </button>
  );
}

/** 关联图：单栋建筑内，同榫型的构件连线 */
function BuildingGraph({
  building,
  rows,
  selKey,
  onSelect,
}: {
  building: string;
  rows: Row[];
  selKey: string | null;
  onSelect: (key: string) => void;
}) {
  const W = 560;
  const H = 300;
  const cx = W / 2;
  const cy = H / 2 + 4;
  const R = Math.min(W, H) / 2 - 58;
  const pts = rows.map((row, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / rows.length;
    return { row, x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  });
  const edges: { id: string; x1: number; y1: number; x2: number; y2: number; label: string }[] = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (pts[i].row.rec.jointType === pts[j].row.rec.jointType) {
        edges.push({
          id: `${pts[i].row.key}~${pts[j].row.key}`,
          x1: pts[i].x,
          y1: pts[i].y,
          x2: pts[j].x,
          y2: pts[j].y,
          label: pts[i].row.rec.jointType,
        });
      }
    }
  }
  return (
    <div className="graph-block">
      <h3>
        {building}
        <span>{rows.length} 个构件 · {edges.length} 条同榫型连线</span>
      </h3>
      <svg viewBox={`0 0 ${W} ${H}`}>
        {edges.map((e) => (
          <g key={e.id}>
            <line className="edge" x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} />
            <text className="edge-label" x={(e.x1 + e.x2) / 2} y={(e.y1 + e.y2) / 2 - 4}>
              {e.label}
            </text>
          </g>
        ))}
        {pts.map(({ row, x, y }) => (
          <g
            key={row.key}
            className={`node ${row.st.status} ${selKey === row.key ? "selected" : ""}`}
            onClick={() => onSelect(row.key)}
          >
            <circle cx={x} cy={y} r={16} />
            <text className="node-label" x={x} y={y + 34}>
              {row.rec.componentNo}
            </text>
            <title>{`${row.rec.building} / ${row.rec.componentNo} · ${row.rec.species} · ${
              row.rec.jointType
            } · ${row.st.status === "pass" ? "可回装" : "待复测"}`}</title>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default App;
