// ============================================================
// 界面层：体检放行台的全部界面只写在这一处。
// 判定规则见 algorithm.ts，档案存取见 archive.ts。
// ============================================================

import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import "./styles.css";
import type {
  ArchiveRecord,
  ComponentFile,
  Conclusion,
  Filter,
  InitialRecord,
  Reading,
  RetestRecord,
  Verdict,
} from "./algorithm";
import {
  EMPTY_FILTER,
  componentKey,
  conclude,
  deformLimitOf,
  groupByComponent,
  hasIssue,
  judgeReading,
  matchFilter,
  retestGate,
} from "./algorithm";
import type { Archive } from "./archive";
import { appendRecord, loadArchive, newId, resetArchive } from "./archive";

const SPECIES = ["杉木", "松木", "柏木", "楠木", "榆木", "槐木"];
const JOINTS = ["燕尾榫", "透榫", "半榫", "箍头榫", "馒头榫", "管脚榫"];

interface Entry {
  file: ComponentFile;
  c: Conclusion;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const parseNum = (v: string): number | null => {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function StatusBadge({ c }: { c: Conclusion }) {
  const cls = c.status === "可回装" ? "ok" : hasIssue(c) ? "alert" : "pending";
  return <span className={`badge ${cls}`}>{c.status}</span>;
}

function App() {
  const [archive, setArchive] = useState<Archive>(loadArchive);
  const [filter, setFilter] = useState<Filter>(EMPTY_FILTER);
  const [selected, setSelected] = useState<string | null>(null);

  const entries = useMemo<Entry[]>(
    () => groupByComponent(archive.records).map((file) => ({ file, c: conclude(file) })),
    [archive]
  );
  const filtered = useMemo(
    () => entries.filter((e) => matchFilter(e.file, e.c, filter)),
    [entries, filter]
  );
  const buildings = useMemo(
    () => [...new Set(entries.map((e) => e.file.building))],
    [entries]
  );
  const speciesInData = useMemo(
    () => [...new Set(entries.map((e) => e.c.species))],
    [entries]
  );
  const jointsInData = useMemo(
    () => [...new Set(entries.map((e) => e.c.jointType))],
    [entries]
  );

  const selectedEntry =
    filtered.find((e) => componentKey(e.file.building, e.file.componentNo) === selected) ??
    filtered[0] ??
    null;
  const selectedKey = selectedEntry
    ? componentKey(selectedEntry.file.building, selectedEntry.file.componentNo)
    : "";
  const graphBuilding =
    filter.building || selectedEntry?.file.building || buildings[0] || "";

  const passCount = entries.filter((e) => e.c.status === "可回装").length;

  function handleAppend(rec: ArchiveRecord) {
    setArchive((a) => appendRecord(a, rec));
    setSelected(componentKey(rec.building, rec.componentNo));
  }

  function exportArchive() {
    const blob = new Blob([JSON.stringify(archive, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "体检放行档案.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleReset() {
    if (window.confirm("确定清空当前档案并恢复样例数据？")) {
      setArchive(resetArchive());
      setSelected(null);
      setFilter(EMPTY_FILTER);
    }
  }

  const setF = (k: keyof Filter) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFilter({ ...filter, [k]: e.target.value });

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62013 · 源提示词8 · Port 62013</p>
        <h1>老殿落架 · 木构件体检放行台</h1>
        <span>
          落架前逐件体检：按建筑与构件编号录入树种、榫型、截面长宽、裂缝深度、变形值与处置意见。
          长宽非正整数或变形超过短边十分之一即留在待复测，原记录只增不改、不被覆盖；
          复测须另一人两次读数均合格才进入可回装清单；树种或榫型一改，旧结论即失效。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>构件总数</small>
          <strong>{entries.length}</strong>
        </article>
        <article>
          <small>可回装</small>
          <strong>{passCount}</strong>
        </article>
        <article>
          <small>待复测</small>
          <strong>{entries.length - passCount}</strong>
        </article>
        <article>
          <small>档案记录</small>
          <strong>{archive.records.length}</strong>
        </article>
      </section>

      <section className="workspace">
        <aside className="side">
          <div className="panel">
            <h2>筛查（三视图联动）</h2>
            <label>
              <span>建筑</span>
              <select value={filter.building} onChange={setF("building")}>
                <option value="">全部建筑</option>
                {buildings.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </label>
            <label>
              <span>榫型</span>
              <select value={filter.jointType} onChange={setF("jointType")}>
                <option value="">全部榫型</option>
                {jointsInData.map((j) => (
                  <option key={j} value={j}>{j}</option>
                ))}
              </select>
            </label>
            <label>
              <span>树种</span>
              <select value={filter.species} onChange={setF("species")}>
                <option value="">全部树种</option>
                {speciesInData.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              <span>状态</span>
              <select value={filter.status} onChange={setF("status")}>
                <option value="">全部状态</option>
                <option value="待复测">待复测</option>
                <option value="可回装">可回装</option>
              </select>
            </label>
            <label>
              <span>编号搜索</span>
              <input
                value={filter.query}
                onChange={setF("query")}
                placeholder="如 梁-03"
              />
            </label>
            <button onClick={() => setFilter(EMPTY_FILTER)}>清空筛查</button>
          </div>

          <InitialForm entries={entries} buildings={buildings} onSubmit={handleAppend} />
        </aside>

        <div className="main-col">
          <section className="panel">
            <div className="heading">
              <div>
                <p>清单 · 剖面标记 · 关联图共同收窄</p>
                <h2>构件清单（{filtered.length}）</h2>
              </div>
              <div className="heading-actions">
                <button onClick={exportArchive}>导出档案JSON</button>
                <button onClick={handleReset}>恢复样例档案</button>
              </div>
            </div>
            {filtered.length === 0 ? (
              <p className="empty">当前筛查条件下无构件</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>建筑</th>
                      <th>构件编号</th>
                      <th>树种</th>
                      <th>榫型</th>
                      <th>截面(mm)</th>
                      <th>裂缝(mm)</th>
                      <th>变形/限值(mm)</th>
                      <th>状态</th>
                      <th>档案</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((e) => {
                      const key = componentKey(e.file.building, e.file.componentNo);
                      const b = e.c.basis;
                      const dimsPos = b !== null && b.lengthMm > 0 && b.widthMm > 0;
                      return (
                        <tr
                          key={key}
                          className={key === selectedKey ? "active" : ""}
                          onClick={() => setSelected(key)}
                        >
                          <td>{e.file.building}</td>
                          <td>{e.file.componentNo}</td>
                          <td>{e.c.species}</td>
                          <td>{e.c.jointType}</td>
                          <td>{b ? `${fmt(b.lengthMm)}×${fmt(b.widthMm)}` : "—"}</td>
                          <td>{b ? fmt(b.crackDepthMm) : "—"}</td>
                          <td>{dimsPos && b ? `${fmt(b.deformMm)} / ${fmt(deformLimitOf(b))}` : "—"}</td>
                          <td><StatusBadge c={e.c} /></td>
                          <td>
                            {e.file.records.length}条
                            {e.c.invalidated && <i className="tag">有失效</i>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="duo">
            <section className="panel">
              <div className="heading">
                <div>
                  <p>剖面标记</p>
                  <h2>
                    {selectedEntry
                      ? `${selectedEntry.file.building} · ${selectedEntry.file.componentNo}`
                      : "未选中构件"}
                  </h2>
                </div>
                {selectedEntry && <StatusBadge c={selectedEntry.c} />}
              </div>
              {selectedEntry ? (
                <>
                  <SectionView entry={selectedEntry} />
                  <ul className="notes">
                    {selectedEntry.c.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                  <HistoryList entry={selectedEntry} />
                </>
              ) : (
                <p className="empty">请在清单或关联图中选择构件</p>
              )}
            </section>

            <section className="panel">
              <div className="heading">
                <div>
                  <p>关联图 · 同榫型相连</p>
                  <h2>{graphBuilding || "关联图"}</h2>
                </div>
              </div>
              <div className="tabs">
                {buildings.map((b) => (
                  <button
                    key={b}
                    className={b === graphBuilding ? "active" : ""}
                    onClick={() => setFilter({ ...filter, building: b })}
                  >
                    {b}
                  </button>
                ))}
                {filter.building && (
                  <button onClick={() => setFilter({ ...filter, building: "" })}>
                    全部建筑
                  </button>
                )}
              </div>
              <GraphView
                entries={filtered}
                building={graphBuilding}
                selectedKey={selectedKey}
                onSelect={setSelected}
              />
              <p className="legend">
                <span><i className="dot ok" />可回装</span>
                <span><i className="dot pending" />待复测</span>
                <span><i className="dot alert" />指标异常</span>
                <span>虚线 = 同榫型</span>
              </p>
            </section>
          </div>

          {selectedEntry && selectedEntry.c.status === "待复测" && (
            <RetestPanel
              key={selectedKey}
              entry={selectedEntry}
              onSubmit={handleAppend}
            />
          )}
        </div>
      </section>
    </main>
  );
}

// ---------------- 初测 / 更正录入 ----------------

function InitialForm({
  entries,
  buildings,
  onSubmit,
}: {
  entries: Entry[];
  buildings: string[];
  onSubmit: (r: InitialRecord) => void;
}) {
  const [f, setF] = useState({
    building: "",
    componentNo: "",
    inspector: "",
    species: SPECIES[0],
    jointType: JOINTS[0],
    lengthMm: "",
    widthMm: "",
    crackDepthMm: "",
    deformMm: "",
    disposition: "",
  });
  const [error, setError] = useState("");

  const set =
    (k: keyof typeof f) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setF({ ...f, [k]: e.target.value });

  const existing = entries.find(
    (e) =>
      e.file.building === f.building.trim() &&
      e.file.componentNo === f.componentNo.trim()
  );
  const willInvalidate =
    !!existing && (existing.c.species !== f.species || existing.c.jointType !== f.jointType);

  const l = parseNum(f.lengthMm);
  const w = parseNum(f.widthMm);
  const ck = parseNum(f.crackDepthMm);
  const df = parseNum(f.deformMm);
  const preview: Verdict | null =
    l !== null && w !== null && ck !== null && df !== null && ck >= 0 && df >= 0
      ? judgeReading({ lengthMm: l, widthMm: w, crackDepthMm: ck, deformMm: df })
      : null;

  function submit() {
    if (!f.building.trim() || !f.componentNo.trim()) {
      return setError("请填写建筑与构件编号");
    }
    if (!f.inspector.trim()) return setError("请填写测定人");
    if (l === null || w === null || ck === null || df === null) {
      return setError("截面长宽、裂缝深度、变形值须为数字");
    }
    if (ck < 0 || df < 0) return setError("裂缝深度与变形值不得为负");
    onSubmit({
      kind: "initial",
      id: newId(),
      building: f.building.trim(),
      componentNo: f.componentNo.trim(),
      inspector: f.inspector.trim(),
      createdAt: new Date().toISOString(),
      species: f.species,
      jointType: f.jointType,
      reading: { lengthMm: l, widthMm: w, crackDepthMm: ck, deformMm: df },
      disposition: f.disposition.trim() || "—",
    });
    setError("");
    setF({
      ...f,
      componentNo: "",
      lengthMm: "",
      widthMm: "",
      crackDepthMm: "",
      deformMm: "",
      disposition: "",
    });
  }

  return (
    <div className="panel">
      <h2>初测 / 更正录入</h2>
      <div className="form-grid">
        <label>
          <span>建筑名称</span>
          <input list="building-list" value={f.building} onChange={set("building")} placeholder="如 正殿" />
          <datalist id="building-list">
            {buildings.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </label>
        <label>
          <span>构件编号</span>
          <input value={f.componentNo} onChange={set("componentNo")} placeholder="如 梁-03" />
        </label>
        <label>
          <span>测定人</span>
          <input value={f.inspector} onChange={set("inspector")} placeholder="姓名" />
        </label>
        <label>
          <span>树种</span>
          <select value={f.species} onChange={set("species")}>
            {SPECIES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          <span>榫型</span>
          <select value={f.jointType} onChange={set("jointType")}>
            {JOINTS.map((j) => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>
        </label>
        <label>
          <span>截面长 (mm)</span>
          <input value={f.lengthMm} onChange={set("lengthMm")} placeholder="正整数" inputMode="decimal" />
        </label>
        <label>
          <span>截面宽 (mm)</span>
          <input value={f.widthMm} onChange={set("widthMm")} placeholder="正整数" inputMode="decimal" />
        </label>
        <label>
          <span>裂缝深度 (mm)</span>
          <input value={f.crackDepthMm} onChange={set("crackDepthMm")} inputMode="decimal" />
        </label>
        <label>
          <span>变形值 (mm)</span>
          <input value={f.deformMm} onChange={set("deformMm")} inputMode="decimal" />
        </label>
        <label className="full">
          <span>处置意见</span>
          <textarea value={f.disposition} onChange={set("disposition")} placeholder="如：节点完好，回装前复查榫肩" />
        </label>
      </div>

      {existing && (
        <p className="mini">
          该构件已有 {existing.file.records.length} 条档案，本次作为更正测定追加，原记录保留不覆盖。
        </p>
      )}
      {willInvalidate && (
        <p className="warn">树种或榫型与档案不符，提交后旧结论即失效，须重新复测。</p>
      )}
      {preview && (
        <p className={preview.pass ? "mini ok-text" : "warn"}>
          预判：{preview.pass ? "初测合格（仍待另一人复测确认）" : preview.reasons.join("；")}
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <button className="primary block" onClick={submit}>
        追加测定记录
      </button>
    </div>
  );
}

// ---------------- 复测登记 ----------------

interface ReadingForm {
  lengthMm: string;
  widthMm: string;
  crackDepthMm: string;
  deformMm: string;
}

const fromReading = (r: Reading | null): ReadingForm => ({
  lengthMm: r ? String(r.lengthMm) : "",
  widthMm: r ? String(r.widthMm) : "",
  crackDepthMm: r ? String(r.crackDepthMm) : "",
  deformMm: r ? String(r.deformMm) : "",
});

const parseReading = (f: ReadingForm): Reading | null => {
  const l = parseNum(f.lengthMm);
  const w = parseNum(f.widthMm);
  const ck = parseNum(f.crackDepthMm);
  const df = parseNum(f.deformMm);
  if (l === null || w === null || ck === null || df === null) return null;
  if (ck < 0 || df < 0) return null;
  return { lengthMm: l, widthMm: w, crackDepthMm: ck, deformMm: df };
};

function RetestPanel({
  entry,
  onSubmit,
}: {
  entry: Entry;
  onSubmit: (r: RetestRecord) => void;
}) {
  const { file, c } = entry;
  const [inspector, setInspector] = useState("");
  const [species, setSpecies] = useState(c.species);
  const [jointType, setJointType] = useState(c.jointType);
  const [disposition, setDisposition] = useState("");
  const [r1, setR1] = useState<ReadingForm>(fromReading(c.basis));
  const [r2, setR2] = useState<ReadingForm>(fromReading(c.basis));
  const [error, setError] = useState("");

  const gate = retestGate(file, inspector);
  const p1 = parseReading(r1);
  const p2 = parseReading(r2);
  const v1 = p1 ? judgeReading(p1) : null;
  const v2 = p2 ? judgeReading(p2) : null;
  const classChanged = species !== c.species || jointType !== c.jointType;

  function submit() {
    if (gate) return setError(gate);
    if (!p1 || !p2) return setError("两次读数须填写完整（数字，裂缝与变形不得为负）");
    onSubmit({
      kind: "retest",
      id: newId(),
      building: file.building,
      componentNo: file.componentNo,
      inspector: inspector.trim(),
      createdAt: new Date().toISOString(),
      species,
      jointType,
      readings: [p1, p2],
      disposition: disposition.trim() || "—",
    });
    setError("");
  }

  return (
    <section className="panel retest">
      <div className="heading">
        <div>
          <p>复测登记 · 两次读数均合格才放行</p>
          <h2>
            {file.building} · {file.componentNo}
          </h2>
        </div>
        <StatusBadge c={c} />
      </div>
      <div className="form-grid">
        <label>
          <span>复测人（须与初测人不同）</span>
          <input
            value={inspector}
            onChange={(e) => setInspector(e.target.value)}
            placeholder="另一人姓名"
          />
        </label>
        <label>
          <span>树种</span>
          <select value={species} onChange={(e) => setSpecies(e.target.value)}>
            {SPECIES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          <span>榫型</span>
          <select value={jointType} onChange={(e) => setJointType(e.target.value)}>
            {JOINTS.map((j) => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>
        </label>
        <label>
          <span>处置意见</span>
          <input
            value={disposition}
            onChange={(e) => setDisposition(e.target.value)}
            placeholder="如：两次读数一致，同意回装"
          />
        </label>
      </div>

      {classChanged && (
        <p className="warn">树种或榫型有改动，提交后此前结论即失效。</p>
      )}

      <ReadingInputs title="读数一" value={r1} onChange={setR1} verdict={v1} />
      <ReadingInputs title="读数二" value={r2} onChange={setR2} verdict={v2} />

      {v1 && v2 && (
        <p className={v1.pass && v2.pass ? "mini ok-text" : "warn"}>
          {v1.pass && v2.pass
            ? "两次读数均合格，提交后进入可回装清单。"
            : "存在不合格读数，提交后仍留在待复测。"}
        </p>
      )}
      {inspector.trim() && gate && <p className="error">{gate}</p>}
      {error && <p className="error">{error}</p>}
      <button className="primary block" onClick={submit}>
        提交复测记录
      </button>
    </section>
  );
}

function ReadingInputs({
  title,
  value,
  onChange,
  verdict,
}: {
  title: string;
  value: ReadingForm;
  onChange: (v: ReadingForm) => void;
  verdict: Verdict | null;
}) {
  const set =
    (k: keyof ReadingForm) =>
    (e: ChangeEvent<HTMLInputElement>) =>
      onChange({ ...value, [k]: e.target.value });
  return (
    <fieldset className="reading">
      <legend>
        {title}
        {verdict &&
          (verdict.pass ? (
            <b className="ok-text"> 合格</b>
          ) : (
            <b className="bad-text"> 不合格</b>
          ))}
      </legend>
      <label>
        <span>长 (mm)</span>
        <input value={value.lengthMm} onChange={set("lengthMm")} inputMode="decimal" />
      </label>
      <label>
        <span>宽 (mm)</span>
        <input value={value.widthMm} onChange={set("widthMm")} inputMode="decimal" />
      </label>
      <label>
        <span>裂缝 (mm)</span>
        <input value={value.crackDepthMm} onChange={set("crackDepthMm")} inputMode="decimal" />
      </label>
      <label>
        <span>变形 (mm)</span>
        <input value={value.deformMm} onChange={set("deformMm")} inputMode="decimal" />
      </label>
      {verdict && !verdict.pass && (
        <p className="warn full">{verdict.reasons.join("；")}</p>
      )}
    </fieldset>
  );
}

// ---------------- 剖面标记 ----------------

function SectionView({ entry }: { entry: Entry }) {
  const { c } = entry;
  const b = c.basis;
  const dimsPos = b !== null && b.lengthMm > 0 && b.widthMm > 0;

  const maxSpan = 165;
  const scale = dimsPos && b ? maxSpan / Math.max(b.lengthMm, b.widthMm) : 1;
  const w = dimsPos && b ? b.lengthMm * scale : 0;
  const h = dimsPos && b ? b.widthMm * scale : 0;
  const x = 155 - w / 2;
  const y = 26;
  const crack = dimsPos && b ? Math.min(b.crackDepthMm, b.widthMm) * scale : 0;
  const limit = dimsPos && b ? deformLimitOf(b) : 0;
  const deform = b ? b.deformMm : 0;
  const over = dimsPos && b ? b.deformMm > limit : false;
  const gaugeMax = Math.max(deform, limit, 1) * 1.25;
  const gw = (v: number) => (v / gaugeMax) * 200;
  const shortIsWidth = dimsPos && b ? b.widthMm <= b.lengthMm : false;

  return (
    <svg viewBox="0 0 340 300" className="section-svg" role="img">
      {dimsPos && b ? (
        <>
          <rect x={x} y={y} width={w} height={h} className="section-body" />
          <path
            d={`M ${x + w * 0.35} ${y} l 6 0 l -3 ${crack} z`}
            className="crack"
          />
          <text x={x + w * 0.35 + 9} y={y + 12} className="dim crack-label">
            裂{fmt(b.crackDepthMm)}
          </text>
          <text
            x={x + w / 2}
            y={y + h + 20}
            textAnchor="middle"
            className={shortIsWidth ? "dim" : "dim short"}
          >
            长 {fmt(b.lengthMm)}mm{shortIsWidth ? "" : "（短边）"}
          </text>
          <text
            x={x - 12}
            y={y + h / 2}
            textAnchor="middle"
            transform={`rotate(-90 ${x - 12} ${y + h / 2})`}
            className={shortIsWidth ? "dim short" : "dim"}
          >
            宽 {fmt(b.widthMm)}mm{shortIsWidth ? "（短边）" : ""}
          </text>
        </>
      ) : (
        <>
          <rect x={75} y={26} width={160} height={120} className="section-body invalid" />
          <text x={155} y={92} textAnchor="middle" className="dim">
            截面尺寸待复测
          </text>
        </>
      )}

      <g transform="translate(40 224)">
        <text x={0} y={-8} className="dim">
          变形值 对照 短边十分之一限值（mm）
        </text>
        <rect x={0} y={2} width={gw(limit)} height={12} className="gauge-limit" />
        <text x={gw(limit) + 6} y={12} className="dim">
          限值 {dimsPos ? fmt(limit) : "—"}
        </text>
        <rect
          x={0}
          y={22}
          width={gw(deform)}
          height={12}
          className={over ? "gauge-bad" : "gauge-ok"}
        />
        <text x={gw(deform) + 6} y={32} className="dim">
          实测 {fmt(deform)}
        </text>
      </g>
    </svg>
  );
}

// ---------------- 关联图 ----------------

function GraphView({
  entries,
  building,
  selectedKey,
  onSelect,
}: {
  entries: Entry[];
  building: string;
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  const list = entries.filter((e) => e.file.building === building);
  if (list.length === 0) {
    return <p className="empty">该建筑在当前筛查下无构件</p>;
  }
  const cx = 230;
  const cy = 150;
  const R = 100;
  const pos = list.map((_, i) => {
    const a = ((-90 + (360 / list.length) * i) * Math.PI) / 180;
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  });
  const edges: Array<[number, number]> = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (list[i].c.jointType === list[j].c.jointType) edges.push([i, j]);
    }
  }
  return (
    <svg viewBox="0 0 460 300" className="graph-svg" role="img">
      {edges.map(([i, j]) => (
        <line
          key={`${i}-${j}`}
          x1={pos[i].x}
          y1={pos[i].y}
          x2={pos[j].x}
          y2={pos[j].y}
          className="edge"
        />
      ))}
      {list.map((e, i) => {
        const key = componentKey(e.file.building, e.file.componentNo);
        const cls =
          e.c.status === "可回装" ? "ok" : hasIssue(e.c) ? "alert" : "pending";
        return (
          <g
            key={key}
            className={`node ${cls} ${key === selectedKey ? "active" : ""}`}
            onClick={() => onSelect(key)}
          >
            {key === selectedKey && (
              <circle cx={pos[i].x} cy={pos[i].y} r={27} className="halo" />
            )}
            <circle cx={pos[i].x} cy={pos[i].y} r={21} />
            <text x={pos[i].x} y={pos[i].y + 4} textAnchor="middle" className="node-label">
              {e.file.componentNo}
            </text>
            <text x={pos[i].x} y={pos[i].y + 38} textAnchor="middle" className="node-sub">
              {e.c.jointType}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------- 档案历史 ----------------

function readingSummary(r: Reading): string {
  return `${fmt(r.lengthMm)}×${fmt(r.widthMm)} 裂${fmt(r.crackDepthMm)} 变${fmt(r.deformMm)}`;
}

function HistoryList({ entry }: { entry: Entry }) {
  const { file, c } = entry;
  return (
    <div>
      <h3 className="history-title">档案（只增不改）</h3>
      <ol className="history">
        {file.records.map((r, i) => {
          const invalid = i < c.validFrom;
          const label = r.kind === "retest" ? "复测" : i === 0 ? "初测" : "更正";
          return (
            <li key={r.id} className={invalid ? "invalid" : ""}>
              <header>
                <b>{label}</b>
                <span>{r.inspector}</span>
                <time>{formatTime(r.createdAt)}</time>
                {invalid && <i className="tag">已失效</i>}
              </header>
              <p>
                {r.species} · {r.jointType} ·{" "}
                {r.kind === "initial"
                  ? readingSummary(r.reading)
                  : `读数一 ${readingSummary(r.readings[0])}｜读数二 ${readingSummary(r.readings[1])}`}
              </p>
              <p className="disp">处置：{r.disposition}</p>
              {r.kind === "initial" ? (
                <VerdictText verdict={judgeReading(r.reading)} />
              ) : (
                <>
                  <VerdictText verdict={judgeReading(r.readings[0])} prefix="读数一 " />
                  <VerdictText verdict={judgeReading(r.readings[1])} prefix="读数二 " />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function VerdictText({ verdict, prefix = "" }: { verdict: Verdict; prefix?: string }) {
  return (
    <p className={verdict.pass ? "mini ok-text" : "warn"}>
      {prefix}
      {verdict.pass ? "合格" : verdict.reasons.join("；")}
    </p>
  );
}

export default App;
