"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/context/ThemeContext";
import { useI18n } from "@/context/LocaleContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LocaleToggle } from "@/components/LocaleToggle";
import { TOGGLE_ICON_BOX, toggleButtonClass } from "@/components/toggleStyles";
import { LoadingDots } from "@/components/ui/LoadingDots";
import { Modal } from "@heroui/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  evalGraphqlApi,
  PAGE_SIZE,
  userGraphqlApi,
  type DatasetItem,
  type DomainScore,
  type EvalTaskItem,
  type ModelItem,
  type ScoreGraphFilterInput,
  type SampleResult,
  type ScorePoint,
  type TaskReport,
} from "@/api/graphql";
import { AUTH_BASE } from "@/components/auth/constants";
import { getTokens, SF_DISPLAY, SF_TEXT, SF_MONO } from "@/utils/tokens";


const ease = [0.25, 0.4, 0.25, 1] as [number, number, number, number];
const ERROR_COLOR = "#dc2626";

const TAB_KEYS = ["graph", "tasks", "models", "datasets"] as const;

type TabKey = (typeof TAB_KEYS)[number];

const ACCESS_TYPES = ["api", "opensource", "selfhost"];
const BACKENDS = ["vllm", "trtllm", "tgi", "api"];
const TASK_STATUSES = ["Pending", "Running", "Paused", "Done", "Failed"];

const VENDOR_PALETTE = [
  "#2E6FB7",
  "#C0392B",
  "#27946C",
  "#D17B2C",
  "#7D54B5",
  "#D14A6F",
  "#1A8AA0",
  "#C9A227",
  "#8E7CC3",
  "#A0522D",
];

const PARETO_COLOR = "#1A1208";
const BUBBLE_FILL_OPACITY = 0.92;
const SERIES_STROKE_OPACITY = 0.65;
const PARETO_STROKE_OPACITY = 0.92;

function vendorColor(vendor: string, vendors: string[]): string {
  const sorted = [...vendors].sort();
  const i = sorted.indexOf(vendor);
  if (i < 0) return VENDOR_PALETTE[0];
  return VENDOR_PALETTE[i % VENDOR_PALETTE.length];
}

function formatCost(cost: number): string {
  if (!isFinite(cost) || cost <= 0) return "—";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  if (cost < 100) return `$${cost.toFixed(2)}`;
  return `$${cost.toFixed(0)}`;
}

function formatPrice(price: number | null, pendingLabel = "—"): string {
  return price == null ? pendingLabel : `$${price.toFixed(4)}`;
}

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/** Wide sample table with mouse-wheel → horizontal scroll. */
function SampleResultsScrollTable({
  samples,
  divider,
  inputBg,
  fg,
  fg2,
  fg3,
  error,
}: {
  samples: SampleResult[];
  divider: string;
  inputBg: string;
  fg: string;
  fg2: string;
  fg3: string;
  error: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      const canScrollX = el.scrollWidth > el.clientWidth + 1;
      if (!canScrollX) return;
      const delta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (delta === 0) return;
      const next = el.scrollLeft + delta;
      const max = el.scrollWidth - el.clientWidth;
      if (next <= 0 && el.scrollLeft <= 0) return;
      if (next >= max && el.scrollLeft >= max - 1) return;
      event.preventDefault();
      el.scrollLeft = Math.max(0, Math.min(max, next));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [samples.length]);

  return (
    <div
      ref={scrollRef}
      style={{
        overflowX: "auto",
        overflowY: "hidden",
        maxWidth: "100%",
        border: `1px solid ${divider}`,
        borderRadius: "10px",
        WebkitOverflowScrolling: "touch",
        overscrollBehaviorX: "contain",
      }}
    >
      <table
        style={{
          width: "max-content",
          minWidth: "100%",
          borderCollapse: "collapse",
          fontFamily: SF_TEXT,
          fontSize: "11px",
        }}
      >
        <thead>
          <tr style={{ color: fg3, textAlign: "left", background: inputBg }}>
            <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>样本</th>
            <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>业务模块</th>
            <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>得分</th>
            <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>状态</th>
            <th style={{ padding: "8px 10px", whiteSpace: "nowrap", minWidth: "280px" }}>回答</th>
            <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>延迟</th>
            <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>Tokens</th>
          </tr>
        </thead>
        <tbody>
          {samples.map((sample) => (
            <tr key={sample.sampleId} style={{ borderTop: `1px solid ${divider}`, color: fg2 }}>
              <td style={{ padding: "8px 10px", whiteSpace: "nowrap", fontFamily: SF_MONO }}>
                {sample.sampleId}
              </td>
              <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                {sample.businessModule || "—"}
              </td>
              <td
                style={{
                  padding: "8px 10px",
                  whiteSpace: "nowrap",
                  color: sample.scoreStatus === "pass" ? fg : error,
                }}
              >
                {sample.score.toFixed(1)}
              </td>
              <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{sample.scoreStatus}</td>
              <td
                style={{
                  padding: "8px 10px",
                  whiteSpace: "nowrap",
                  maxWidth: "480px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={sample.answer}
              >
                {sample.answer}
              </td>
              <td style={{ padding: "8px 10px", whiteSpace: "nowrap", fontFamily: SF_MONO }}>
                {sample.latencyMs == null ? "—" : `${sample.latencyMs.toFixed(0)}ms`}
              </td>
              <td style={{ padding: "8px 10px", whiteSpace: "nowrap", fontFamily: SF_MONO }}>
                {sample.totalTokens == null ? "—" : sample.totalTokens}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


/** STANDARD-UI 仪表盘密度：8px 网格 + 光学字号阶梯（略紧于营销页） */
const PANEL_PAD = "24px";
const PANEL_RADIUS = 12;
const TYPE = {
  displaySm: { fontSize: "21px", letterSpacing: "0.23px", lineHeight: 1.19 },
  title: { fontSize: "15px", letterSpacing: "-0.3px", lineHeight: 1.25 },
  body: { fontSize: "14px", letterSpacing: "-0.22px", lineHeight: 1.43 },
  caption: { fontSize: "13px", letterSpacing: "-0.16px", lineHeight: 1.4 },
  label: { fontSize: "12px", letterSpacing: "-0.12px", lineHeight: 1.33 },
  micro: { fontSize: "11px", letterSpacing: "-0.08px", lineHeight: 1.3 },
} as const;

const GRAPH_LEFT_DEFAULT = 220;
const GRAPH_RIGHT_DEFAULT = 280;
const GRAPH_LEFT_MIN = 176;
const GRAPH_LEFT_MAX = 360;
const GRAPH_RIGHT_MIN = 220;
const GRAPH_RIGHT_MAX = 440;
const GRAPH_WIDTHS_KEY = "id009-graph-panel-widths";

const Card = ({
  children,
  className = "",
  bg,
  shadow,
  border,
  style,
  noPadding,
}: {
  children: React.ReactNode;
  className?: string;
  bg: string;
  shadow?: string;
  border?: string;
  style?: React.CSSProperties;
  noPadding?: boolean;
}) => (
  <div
    className={`overflow-hidden ${className}`}
    style={{
      background: bg,
      /* STANDARD-UI §7.3：默认无边框/无阴影；需要抬起时由调用方显式传入 */
      boxShadow: shadow || "none",
      border: border || "none",
      borderRadius: PANEL_RADIUS,
      ...style,
    }}
  >
    {noPadding ? children : <div style={{ padding: PANEL_PAD }}>{children}</div>}
  </div>
);

const PillButton = ({
  children,
  onClick,
  disabled,
  primary,
  fg,
  fg3,
  accent,
  accentFg,
  divider,
  small,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
  fg: string;
  fg3: string;
  accent: string;
  accentFg: string;
  divider: string;
  small?: boolean;
  type?: "button" | "submit" | "reset";
}) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className="transition-opacity duration-200 hover:opacity-75 disabled:opacity-40 disabled:cursor-not-allowed"
    style={{
      fontFamily: SF_TEXT,
      fontSize: small ? TYPE.label.fontSize : TYPE.body.fontSize,
      fontWeight: primary ? 600 : 500,
      letterSpacing: small ? TYPE.label.letterSpacing : TYPE.body.letterSpacing,
      background: primary ? accent : "transparent",
      color: primary ? accentFg : fg,
      border: primary ? "none" : `1px solid ${accent}`,
      borderRadius: "980px",
      padding: small ? "5px 12px" : "7px 16px",
      cursor: disabled ? "not-allowed" : "pointer",
      whiteSpace: "nowrap",
      minHeight: small ? 30 : 36,
      lineHeight: 1.25,
    }}
  >
    {children}
  </button>
);

/** 评分图谱三栏之间的拖拽分隔条 */
const ColResizeHandle = ({
  onMouseDown,
  divider,
  label,
}: {
  onMouseDown: (e: React.MouseEvent) => void;
  divider: string;
  label: string;
}) => (
  <div
    role="separator"
    aria-orientation="vertical"
    aria-label={label}
    title={label}
    onMouseDown={onMouseDown}
    className="group shrink-0"
    style={{
      width: 10,
      margin: "0 -1px",
      cursor: "col-resize",
      touchAction: "none",
      display: "flex",
      alignItems: "stretch",
      justifyContent: "center",
      zIndex: 2,
    }}
  >
    <div
      className="transition-opacity duration-150 opacity-40 group-hover:opacity-100 group-active:opacity-100"
      style={{
        width: 2,
        margin: "12px 0",
        borderRadius: 2,
        background: divider,
      }}
    />
  </div>
);

const Badge = ({
  children,
  bg,
  color,
  border,
  mono,
}: {
  children: React.ReactNode;
  bg: string;
  color: string;
  border?: string;
  mono?: boolean;
}) => (
  <span
    className="inline-flex items-center"
    style={{
      fontFamily: mono ? SF_MONO : SF_TEXT,
      fontSize: TYPE.label.fontSize,
      fontWeight: 600,
      letterSpacing: "0.04em",
      color,
      background: bg,
      border: border ? `1px solid ${border}` : "none",
      borderRadius: "980px",
      padding: "4px 10px",
      whiteSpace: "nowrap",
      lineHeight: TYPE.label.lineHeight,
    }}
  >
    {children}
  </span>
);

const FieldLabel = ({ children, color }: { children: React.ReactNode; color: string }) => (
  <div
    style={{
      fontFamily: SF_TEXT,
      fontSize: TYPE.label.fontSize,
      fontWeight: 600,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      color,
      marginBottom: "8px",
      lineHeight: TYPE.label.lineHeight,
    }}
  >
    {children}
  </div>
);

const PaginationBar = ({
  page,
  pageSize,
  total,
  onChange,
  fg,
  fg3,
  accent,
  accentFg,
  divider,
  prevLabel,
  nextLabel,
  summary,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  fg: string;
  fg3: string;
  accent: string;
  accentFg: string;
  divider: string;
  prevLabel: string;
  nextLabel: string;
  summary: string;
}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) {
    return total > 0 ? (
      <div style={{ marginTop: "16px", fontFamily: SF_TEXT, fontSize: "13px", color: fg3 }}>
        {summary}
      </div>
    ) : null;
  }
  return (
    <div
      className="flex items-center justify-between flex-wrap gap-3"
      style={{ marginTop: "16px" }}
    >
      <span style={{ fontFamily: SF_TEXT, fontSize: "13px", color: fg3 }}>{summary}</span>
      <div className="flex items-center gap-2">
        <PillButton
          small
          fg={fg}
          fg3={fg3}
          accent={accent}
          accentFg={accentFg}
          divider={divider}
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          {prevLabel}
        </PillButton>
        <span style={{ fontFamily: SF_MONO, fontSize: "12px", color: fg }}>
          {page} / {totalPages}
        </span>
        <PillButton
          small
          fg={fg}
          fg3={fg3}
          accent={accent}
          accentFg={accentFg}
          divider={divider}
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          {nextLabel}
        </PillButton>
      </div>
    </div>
  );
};

const inputBaseStyle = (
  fg: string,
  inputBg: string,
  inputBorder: string,
): React.CSSProperties => ({
  fontFamily: SF_TEXT,
  fontSize: TYPE.body.fontSize,
  letterSpacing: TYPE.body.letterSpacing,
  lineHeight: TYPE.body.lineHeight,
  color: fg,
  backgroundColor: inputBg,
  border: `1px solid ${inputBorder}`,
  borderRadius: PANEL_RADIUS,
  padding: "8px 12px",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  minHeight: 36,
});

const DomainScoreBar = ({
  ds,
  fg,
  fg2,
  fg3,
  divider,
}: {
  ds: DomainScore;
  fg: string;
  fg2: string;
  fg3: string;
  divider: string;
}) => (
  <div>
    <div className="flex items-center justify-between" style={{ marginBottom: "4px" }}>
      <span style={{ fontFamily: SF_TEXT, fontSize: "14px", color: fg2, letterSpacing: "-0.22px" }}>
        {ds.domain}
      </span>
      <span style={{ fontFamily: SF_MONO, fontSize: "12px", color: fg, fontWeight: 600 }}>
        {ds.score.toFixed(1)}
      </span>
    </div>
    <div
      style={{
        height: "4px",
        borderRadius: "2px",
        background: divider,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${Math.max(0, Math.min(100, ds.score))}%`,
          background: fg,
          borderRadius: "2px",
          transition: "width 0.45s cubic-bezier(0.25,0.4,0.25,1)",
        }}
      />
    </div>
  </div>
);


export default function Home() {
  const router = useRouter();
  const { theme } = useTheme();
  const { t: tx } = useI18n();
  const isDark = theme === "dark";

  const t = getTokens(isDark);
  const { bg, fg, fg2, fg3, fg4, card, inputBg, inputBorder, divider, shadow, navBg, accent, accentFg, badgeBg, error, errorBg, errorBorder } = t;

  const cardHighlight = isDark ? "inset 0 1px 0 rgba(255,255,255,0.07)" : "inset 0 1px 0 rgba(255,255,255,0.9)";
  const cardShadow = `${shadow}, ${cardHighlight}`;

  const [activeTab, setActiveTab] = useState<TabKey>("graph");

  const tabs = useMemo(
    () => [
      { key: "graph" as const, label: tx("home.tabGraph") },
      { key: "tasks" as const, label: tx("home.tabTasks") },
      { key: "models" as const, label: tx("home.tabModels") },
      { key: "datasets" as const, label: tx("home.tabDatasets") },
    ],
    [tx],
  );
  const [userEmail, setUserEmail] = useState("");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const [graphLeftWidth, setGraphLeftWidth] = useState(GRAPH_LEFT_DEFAULT);
  const [graphRightWidth, setGraphRightWidth] = useState(GRAPH_RIGHT_DEFAULT);
  const graphDragRef = useRef<{
    side: "left" | "right";
    startX: number;
    startWidth: number;
  } | null>(null);
  const graphWidthsRef = useRef({ left: GRAPH_LEFT_DEFAULT, right: GRAPH_RIGHT_DEFAULT });

  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      if (raw) {
        const u = JSON.parse(raw);
        if (u?.email) setUserEmail(u.email);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(GRAPH_WIDTHS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { left?: number; right?: number };
      if (typeof parsed.left === "number") {
        const left = Math.min(GRAPH_LEFT_MAX, Math.max(GRAPH_LEFT_MIN, parsed.left));
        setGraphLeftWidth(left);
        graphWidthsRef.current.left = left;
      }
      if (typeof parsed.right === "number") {
        const right = Math.min(GRAPH_RIGHT_MAX, Math.max(GRAPH_RIGHT_MIN, parsed.right));
        setGraphRightWidth(right);
        graphWidthsRef.current.right = right;
      }
    } catch {}
  }, []);

  useEffect(() => {
    const check = () => setIsNarrow(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = graphDragRef.current;
      if (!drag) return;
      if (drag.side === "left") {
        const next = Math.min(
          GRAPH_LEFT_MAX,
          Math.max(GRAPH_LEFT_MIN, drag.startWidth + (e.clientX - drag.startX)),
        );
        graphWidthsRef.current.left = next;
        setGraphLeftWidth(next);
      } else {
        const next = Math.min(
          GRAPH_RIGHT_MAX,
          Math.max(GRAPH_RIGHT_MIN, drag.startWidth - (e.clientX - drag.startX)),
        );
        graphWidthsRef.current.right = next;
        setGraphRightWidth(next);
      }
    };
    const onUp = () => {
      if (!graphDragRef.current) return;
      graphDragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        localStorage.setItem(
          GRAPH_WIDTHS_KEY,
          JSON.stringify({
            left: graphWidthsRef.current.left,
            right: graphWidthsRef.current.right,
          }),
        );
      } catch {}
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const beginGraphResize = useCallback((side: "left" | "right") => (e: React.MouseEvent) => {
    e.preventDefault();
    graphDragRef.current = {
      side,
      startX: e.clientX,
      startWidth: side === "left" ? graphWidthsRef.current.left : graphWidthsRef.current.right,
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const handleLogout = useCallback(async () => {
    setShowLogoutConfirm(false);
    try {
      await userGraphqlApi.logout();
    } catch {}
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push(`${AUTH_BASE}/login`);
  }, [router]);

  const [graphData, setGraphData] = useState<{ points: ScorePoint[]; frontier: { x: number; y: number }[]; vendors: string[] }>({ points: [], frontier: [], vendors: [] });
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState("");
  const [filterVendors, setFilterVendors] = useState<string[]>([]);
  const [filterAccessType, setFilterAccessType] = useState("");
  const [filterBackend, setFilterBackend] = useState("");
  const [filterMinScore, setFilterMinScore] = useState("");
  const [filterMaxCost, setFilterMaxCost] = useState("");
  const [selectedPoint, setSelectedPoint] = useState<ScorePoint | null>(null);
  const [hoverPoint, setHoverPoint] = useState<{ point: ScorePoint; cx: number; cy: number } | null>(null);
  const [compareList, setCompareList] = useState<ScorePoint[]>([]);
  const [compareNotice, setCompareNotice] = useState("");
  const [showCompare, setShowCompare] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const canvasResizeRef = useRef<ResizeObserver | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 720, h: 480 });

  const observeCanvas = useCallback((el: HTMLDivElement | null) => {
    if (canvasResizeRef.current) {
      canvasResizeRef.current.disconnect();
      canvasResizeRef.current = null;
    }
    if (el) {
      const ro = new ResizeObserver((entries) => {
        const rect = entries[0].contentRect;
        setCanvasSize({ w: Math.max(320, rect.width), h: Math.max(320, rect.height) });
      });
      ro.observe(el);
      canvasResizeRef.current = ro;
    }
  }, []);

  const loadGraph = useCallback(async (filter?: ScoreGraphFilterInput) => {
    setGraphLoading(true);
    setGraphError("");
    try {
      const r = await evalGraphqlApi.getScoreCostGraph(filter);
      setGraphData(r.scoreCostGraph);
    } catch (e: any) {
      setGraphError(e.message || tx("common.loadingFailed"));
    } finally {
      setGraphLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "graph") {
      void loadGraph();
    }
  }, [activeTab, loadGraph]);

  useEffect(() => {
    return () => {
      if (canvasResizeRef.current) {
        canvasResizeRef.current.disconnect();
        canvasResizeRef.current = null;
      }
    };
  }, []);

  const applyFilter = useCallback(() => {
    const filter: ScoreGraphFilterInput = {};
    if (filterVendors.length > 0) filter.vendors = filterVendors;
    if (filterAccessType) filter.accessType = filterAccessType;
    if (filterBackend) filter.backend = filterBackend;
    if (filterMinScore.trim()) {
      const n = parseFloat(filterMinScore);
      if (!isNaN(n)) filter.minScore = n;
    }
    if (filterMaxCost.trim()) {
      const n = parseFloat(filterMaxCost);
      if (!isNaN(n)) filter.maxCost = n;
    }
    void loadGraph(filter);
  }, [filterVendors, filterAccessType, filterBackend, filterMinScore, filterMaxCost, loadGraph]);

  const resetFilter = useCallback(() => {
    setFilterVendors([]);
    setFilterAccessType("");
    setFilterBackend("");
    setFilterMinScore("");
    setFilterMaxCost("");
    void loadGraph();
  }, [loadGraph]);

  const geom = useMemo(() => {
    const { points, frontier } = graphData;
    const W = canvasSize.w;
    const H = canvasSize.h;
    const ML = 56;
    const MR = 24;
    const MT = 24;
    const MB = 52;
    const plotW = W - ML - MR;
    const plotH = H - MT - MB;

    if (points.length === 0) {
      return { W, H, ML, MR, MT, MB, plotW, plotH, xMin: 0, xMax: 1, yMin: 0, yMax: 100, logMin: 0, logMax: 1, xTicks: [] as number[], yTicks: [] as number[], toX: (_c: number) => 0, toY: (_s: number) => 0, seriesLines: [] as { pts: { x: number; y: number }[]; vendor: string }[], frontierPts: [] as { x: number; y: number }[] };
    }

    const costs = points.map((p) => p.costPerTask).filter((cost) => cost > 0);
    const scores = points.map((p) => p.compositeScore);
    let cMin = Math.min(...costs);
    let cMax = Math.max(...costs);
    if (cMax <= cMin) cMax = cMin * 10;

    let sMin = Math.min(...scores);
    let sMax = Math.max(...scores);
    if (sMax <= sMin) {
      sMax = sMin + 10;
    }
    const sPad = Math.max(2, (sMax - sMin) * 0.1);
    const yMin = Math.max(0, Math.floor((sMin - sPad) / 5) * 5);
    const yMax = Math.min(100, Math.ceil((sMax + sPad) / 5) * 5);

    const logMin = Math.floor(Math.log10(cMin));
    const logMax = Math.ceil(Math.log10(cMax));

    const toX = (cost: number) => {
      const lc = Math.log10(Math.max(cost, 1e-6));
      const ratio = (lc - logMin) / Math.max(logMax - logMin, 1e-9);
      return ML + ratio * plotW;
    };
    const toY = (score: number) => {
      const ratio = (score - yMin) / Math.max(yMax - yMin, 1e-9);
      return MT + (1 - ratio) * plotH;
    };

    const xTicks: number[] = [];
    for (let e = logMin; e <= logMax; e++) xTicks.push(e);

    const yTicks: number[] = [];
    const yStep = Math.max(1, Math.round((yMax - yMin) / 6));
    for (let v = yMin; v <= yMax; v += yStep) yTicks.push(v);
    if (yTicks[yTicks.length - 1] !== yMax) yTicks.push(yMax);

    const groups = new Map<string, ScorePoint[]>();
    for (const p of points) {
      const key = `${p.vendor}::${p.series}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }
    const seriesLines: { pts: { x: number; y: number }[]; vendor: string }[] = [];
    for (const g of groups.values()) {
      if (g.length >= 2) {
        const sorted = [...g].sort((a, b) => a.costPerTask - b.costPerTask);
        seriesLines.push({ pts: sorted.map((p) => ({ x: toX(p.costPerTask), y: toY(p.compositeScore) })), vendor: g[0].vendor });
      }
    }

    const frontierPts = [...frontier]
      .sort((a, b) => a.x - b.x)
      .map((f) => ({ x: toX(f.x), y: toY(f.y) }));

    return { W, H, ML, MR, MT, MB, plotW, plotH, xMin: cMin, xMax: cMax, yMin, yMax, logMin, logMax, xTicks, yTicks, toX, toY, seriesLines, frontierPts };
  }, [graphData, canvasSize]);

  const addToCompare = useCallback(
    (p: ScorePoint) => {
      if (compareList.some((x) => x.modelId === p.modelId)) return;
      if (compareList.length >= 4) {
        setCompareNotice(tx("home.maxCompare"));
        return;
      }
      setCompareNotice("");
      setCompareList([...compareList, p]);
    },
    [compareList],
  );
  const removeFromCompare = useCallback((modelId: string) => {
    setCompareNotice("");
    setCompareList((prev) => prev.filter((x) => x.modelId !== modelId));
  }, []);

  const compareDomains = useMemo(() => {
    const names: string[] = [];
    for (const p of compareList) {
      for (const d of p.domainScores) {
        if (!names.includes(d.domain)) names.push(d.domain);
      }
    }
    return names;
  }, [compareList]);

  const [tasks, setTasks] = useState<EvalTaskItem[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState("");
  const [tasksPage, setTasksPage] = useState(1);
  const [tasksTotal, setTasksTotal] = useState(0);
  const [actionMessage, setActionMessage] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadTasks = useCallback(async (status?: string, page = tasksPage) => {
    setTasksLoading(true);
    setTasksError("");
    try {
      const r = await evalGraphqlApi.listTasks({
        status: status || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setTasks(r.tasks.items);
      setTasksTotal(r.tasks.total);
      setTasksPage(r.tasks.page);
    } catch (e: any) {
      setTasksError(e.message || tx("common.loadingFailed"));
    } finally {
      setTasksLoading(false);
    }
  }, [tasksPage]);

  useEffect(() => {
    if (activeTab === "tasks") {
      void loadTasks(taskStatusFilter || undefined, tasksPage);
    }
  }, [activeTab, taskStatusFilter, tasksPage, loadTasks]);

  const hasActiveTask = tasks.some((tk) => tk.status === "Pending" || tk.status === "Running");

  useEffect(() => {
    if (activeTab === "tasks" && hasActiveTask) {
      pollRef.current = setInterval(() => {
        void loadTasks(taskStatusFilter || undefined);
      }, 2000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [activeTab, hasActiveTask, taskStatusFilter, loadTasks]);

  const [showCreateTask, setShowCreateTask] = useState(false);
  const [ctName, setCtName] = useState("");
  const [ctModelId, setCtModelId] = useState<number | "">("");
  const [ctDatasetIds, setCtDatasetIds] = useState<number[]>([]);
  const [ctBackend, setCtBackend] = useState("vllm");
  const [ctTemperature, setCtTemperature] = useState("0");
  const [ctMaxTokens, setCtMaxTokens] = useState("2048");
  const [ctSubmitting, setCtSubmitting] = useState(false);
  const [ctError, setCtError] = useState("");
  const [ctModels, setCtModels] = useState<ModelItem[]>([]);
  const [ctDatasets, setCtDatasets] = useState<DatasetItem[]>([]);
  const [ctLoadingData, setCtLoadingData] = useState(false);

  const openCreateTask = useCallback(async () => {
    setShowCreateTask(true);
    setCtError("");
    setCtName("");
    setCtModelId("");
    setCtDatasetIds([]);
    setCtBackend("vllm");
    setCtTemperature("0");
    setCtMaxTokens("2048");
    setCtLoadingData(true);
    try {
      const [m, d] = await Promise.all([
        evalGraphqlApi.listModels({ page: 1, pageSize: 500 }),
        evalGraphqlApi.listDatasets({ page: 1, pageSize: 500 }),
      ]);
      setCtModels(m.models.items);
      setCtDatasets(d.datasets.items);
      if (m.models.items.length > 0) setCtModelId(m.models.items[0].id);
    } catch (e: any) {
      setCtError(e.message || tx("home.loadModelsDatasetsFailed"));
    } finally {
      setCtLoadingData(false);
    }
  }, []);

  const submitCreateTask = useCallback(async () => {
    setCtError("");
    if (!ctName.trim()) {
      setCtError(tx("home.needTaskName"));
      return;
    }
    if (!ctModelId) {
      setCtError(tx("home.needModel"));
      return;
    }
    if (ctDatasetIds.length === 0) {
      setCtError(tx("home.needDataset"));
      return;
    }
    const temp = parseFloat(ctTemperature);
    const mt = parseInt(ctMaxTokens, 10);
    if (isNaN(temp) || temp < 0 || temp > 2) {
      setCtError(tx("home.tempRange"));
      return;
    }
    if (isNaN(mt) || mt <= 0) {
      setCtError(tx("home.maxTokensPositive"));
      return;
    }
    setCtSubmitting(true);
    try {
      const r = await evalGraphqlApi.createTask({
        name: ctName.trim(),
        modelId: Number(ctModelId),
        datasetIds: ctDatasetIds.map((id) => Number(id)),
        backend: ctBackend,
        temperature: temp,
        maxTokens: mt,
      });
      if (!r.createTask.success) {
        setCtError(r.createTask.message || tx("home.createFailed"));
        return;
      }
      setShowCreateTask(false);
      setActionMessage(tx("home.taskCreated"));
      setTimeout(() => setActionMessage(""), 4000);
      void loadTasks(taskStatusFilter || undefined);
    } catch (e: any) {
      setCtError(e.message || tx("home.createFailed"));
    } finally {
      setCtSubmitting(false);
    }
  }, [ctName, ctModelId, ctDatasetIds, ctBackend, ctTemperature, ctMaxTokens, loadTasks, taskStatusFilter]);

  const [reportTaskUid, setReportTaskUid] = useState<string | null>(null);
  const [report, setReport] = useState<TaskReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");

  const openReport = useCallback(async (taskUid: string) => {
    setReportTaskUid(taskUid);
    setReport(null);
    setReportError("");
    setReportLoading(true);
    try {
      const r = await evalGraphqlApi.getTaskReport(taskUid);
      setReport(r.taskReport);
    } catch (e: any) {
      setReportError(e.message || tx("home.loadReportFailed"));
    } finally {
      setReportLoading(false);
    }
  }, []);

  const taskAction = useCallback(
    async (taskUid: string, kind: "pause" | "resume" | "delete") => {
      setActionMessage("");
      try {
        if (kind === "pause") {
          const r = await evalGraphqlApi.pauseTask(taskUid);
          setActionMessage(r.pauseTask?.message || tx("home.paused"));
        } else if (kind === "resume") {
          const r = await evalGraphqlApi.resumeTask(taskUid);
          setActionMessage(r.resumeTask?.message || tx("home.resumed"));
        } else {
          const r = await evalGraphqlApi.deleteTask(taskUid);
          if (!r.deleteTask?.success) {
            setActionMessage(r.deleteTask?.message || tx("home.deleteFailed"));
          } else {
            setActionMessage(r.deleteTask.message || tx("home.deleted"));
            if (reportTaskUid === taskUid) setReportTaskUid(null);
          }
        }
        void loadTasks(taskStatusFilter || undefined);
      } catch (e: any) {
        setActionMessage(e.message || tx("home.opFailed"));
      }
      setTimeout(() => setActionMessage(""), 4000);
    },
    [loadTasks, taskStatusFilter, reportTaskUid],
  );

  const [models, setModels] = useState<ModelItem[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");
  const [modelsNotice, setModelsNotice] = useState("");
  const [modelsPage, setModelsPage] = useState(1);
  const [modelsTotal, setModelsTotal] = useState(0);
  const [mfQ, setMfQ] = useState("");
  const [mfName, setMfName] = useState("");
  const [mfVendor, setMfVendor] = useState("");
  const [mfSeries, setMfSeries] = useState("");
  const [modelsFilter, setModelsFilter] = useState<{
    q?: string;
    name?: string;
    vendor?: string;
    series?: string;
  }>({});
  const modelsFilterRef = useRef(modelsFilter);
  modelsFilterRef.current = modelsFilter;
  const modelsPageRef = useRef(modelsPage);
  modelsPageRef.current = modelsPage;

  const modelsFilterActive = Boolean(
    modelsFilter.q || modelsFilter.name || modelsFilter.vendor || modelsFilter.series,
  );

  const loadModels = useCallback(async (
    filter?: {
      q?: string;
      name?: string;
      vendor?: string;
      series?: string;
    },
    page?: number,
  ) => {
    const f = filter ?? modelsFilterRef.current;
    const p = page ?? modelsPageRef.current;
    setModelsLoading(true);
    setModelsError("");
    try {
      const r = await evalGraphqlApi.listModels({
        q: f.q || undefined,
        name: f.name || undefined,
        vendor: f.vendor || undefined,
        series: f.series || undefined,
        page: p,
        pageSize: PAGE_SIZE,
      });
      setModels(r.models.items);
      setModelsTotal(r.models.total);
      setModelsPage(r.models.page);
    } catch (e: any) {
      setModelsError(e.message || tx("common.loadingFailed"));
    } finally {
      setModelsLoading(false);
    }
  }, []);

  const applyModelsFilter = useCallback(() => {
    const next = {
      q: mfQ.trim() || undefined,
      name: mfName.trim() || undefined,
      vendor: mfVendor.trim() || undefined,
      series: mfSeries.trim() || undefined,
    };
    setModelsFilter(next);
    setModelsPage(1);
    void loadModels(next, 1);
  }, [mfQ, mfName, mfVendor, mfSeries, loadModels]);

  const resetModelsFilter = useCallback(() => {
    setMfQ("");
    setMfName("");
    setMfVendor("");
    setMfSeries("");
    const next = {};
    setModelsFilter(next);
    setModelsPage(1);
    void loadModels(next, 1);
  }, [loadModels]);

  const deleteModel = useCallback(
    async (modelId: number) => {
      setModelsNotice("");
      setModelsError("");
      try {
        const r = await evalGraphqlApi.deleteModel(modelId);
        if (!r.deleteModel?.success) {
          setModelsNotice(r.deleteModel?.message || tx("home.deleteModelFailed"));
        } else {
          setModelsNotice(r.deleteModel.message || tx("home.modelDeleted"));
          setCompareList((prev) => prev.filter((p) => Number(p.modelId) !== modelId));
          if (selectedPoint != null && Number(selectedPoint.modelId) === modelId) {
            setSelectedPoint(null);
          }
          void loadModels();
          void loadTasks(taskStatusFilter || undefined);
          void loadGraph();
        }
      } catch (e: any) {
        setModelsNotice(e.message || tx("home.opFailed"));
      }
      setTimeout(() => setModelsNotice(""), 4000);
    },
    [loadModels, loadTasks, loadGraph, taskStatusFilter, selectedPoint],
  );

  useEffect(() => {
    if (activeTab === "models") {
      void loadModels();
    }
  }, [activeTab, loadModels]);

  const [showRegisterModel, setShowRegisterModel] = useState(false);
  const [editingModelId, setEditingModelId] = useState<number | null>(null);
  const [rmName, setRmName] = useState("");
  const [rmVendor, setRmVendor] = useState("");
  const [rmSeries, setRmSeries] = useState("");
  const [rmVersion, setRmVersion] = useState("");
  const [rmBaseUrl, setRmBaseUrl] = useState("https://apihk.chinarouter.net/v1");
  const [rmApiKey, setRmApiKey] = useState("");
  const [rmApiKeyHint, setRmApiKeyHint] = useState("");
  const [rmModelName, setRmModelName] = useState("");
  const [rmInputPrice, setRmInputPrice] = useState("");
  const [rmOutputPrice, setRmOutputPrice] = useState("");
  const [rmSubmitting, setRmSubmitting] = useState(false);
  const [rmError, setRmError] = useState("");
  const isEditingModel = editingModelId != null;

  const resetModelForm = useCallback(() => {
    setRmError("");
    setRmName("");
    setRmVendor("");
    setRmSeries("");
    setRmVersion("");
    setRmBaseUrl("https://apihk.chinarouter.net/v1");
    setRmApiKey("");
    setRmApiKeyHint("");
    setRmModelName("");
    setRmInputPrice("");
    setRmOutputPrice("");
    setEditingModelId(null);
  }, []);

  const openRegisterModel = useCallback(() => {
    resetModelForm();
    setShowRegisterModel(true);
  }, [resetModelForm]);

  const openEditModel = useCallback((m: ModelItem) => {
    setRmError("");
    setEditingModelId(m.id);
    setRmName(m.name || "");
    setRmVendor(m.vendor || "");
    setRmSeries(m.series || "");
    setRmVersion(m.version || "");
    setRmBaseUrl(m.baseUrl || "https://apihk.chinarouter.net/v1");
    setRmApiKey("");
    setRmApiKeyHint(m.apiKeyMasked || "");
    setRmModelName(m.modelName || m.name || "");
    setRmInputPrice(m.inputPricePer1m != null ? String(m.inputPricePer1m) : "");
    setRmOutputPrice(m.outputPricePer1m != null ? String(m.outputPricePer1m) : "");
    setShowRegisterModel(true);
  }, []);

  const closeModelForm = useCallback(() => {
    setShowRegisterModel(false);
    resetModelForm();
  }, [resetModelForm]);

  const submitRegisterModel = useCallback(async () => {
    setRmError("");
    if (!rmName.trim() || !rmVendor.trim() || !rmSeries.trim() || !rmVersion.trim()) {
      setRmError(tx("home.needModelFields"));
      return;
    }
    if (!rmBaseUrl.trim() || !rmModelName.trim()) {
      setRmError(tx("home.needEndpointFields"));
      return;
    }
    if (!isEditingModel && !rmApiKey.trim()) {
      setRmError(tx("home.needEndpointFields"));
      return;
    }
    if (!rmInputPrice.trim() || !rmOutputPrice.trim()) {
      setRmError(tx("home.needPriceFields"));
      return;
    }
    const inputPrice = parseFloat(rmInputPrice);
    const outputPrice = parseFloat(rmOutputPrice);
    if (isNaN(inputPrice) || inputPrice < 0 || isNaN(outputPrice) || outputPrice < 0) {
      setRmError(tx("home.priceNonNeg"));
      return;
    }
    setRmSubmitting(true);
    try {
      const payloadBase = {
        name: rmName.trim(),
        vendor: rmVendor.trim(),
        series: rmSeries.trim(),
        version: rmVersion.trim(),
        baseUrl: rmBaseUrl.trim().replace(/\/+$/, ""),
        modelName: rmModelName.trim(),
        inputPricePer1m: inputPrice,
        outputPricePer1m: outputPrice,
        accessType: "api",
        backend: "api",
      };
      if (isEditingModel && editingModelId != null) {
        const r = await evalGraphqlApi.updateModel({
          modelId: editingModelId,
          ...payloadBase,
          apiKey: rmApiKey.trim() || null,
        });
        if (!r.updateModel.success) {
          setRmError(r.updateModel.message || tx("home.updateFailed"));
          return;
        }
        closeModelForm();
        setModelsNotice(tx("home.modelUpdated"));
        setTimeout(() => setModelsNotice(""), 4000);
        void loadModels();
        void loadGraph();
      } else {
        const r = await evalGraphqlApi.registerModel({
          ...payloadBase,
          apiKey: rmApiKey.trim(),
        });
        if (!r.registerModel.success) {
          setRmError(r.registerModel.message || tx("home.registerFailed"));
          return;
        }
        closeModelForm();
        setModelsNotice(tx("home.modelRegistered"));
        setTimeout(() => setModelsNotice(""), 4000);
        void loadModels();
      }
    } catch (e: any) {
      setRmError(e.message || (isEditingModel ? tx("home.updateFailed") : tx("home.registerFailed")));
    } finally {
      setRmSubmitting(false);
    }
  }, [
    rmName,
    rmVendor,
    rmSeries,
    rmVersion,
    rmBaseUrl,
    rmApiKey,
    rmModelName,
    rmInputPrice,
    rmOutputPrice,
    isEditingModel,
    editingModelId,
    closeModelForm,
    loadModels,
    loadGraph,
  ]);

  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(false);
  const [datasetsError, setDatasetsError] = useState("");
  const [datasetsPage, setDatasetsPage] = useState(1);
  const [datasetsTotal, setDatasetsTotal] = useState(0);

  const loadDatasets = useCallback(async (page = datasetsPage) => {
    setDatasetsLoading(true);
    setDatasetsError("");
    try {
      const r = await evalGraphqlApi.listDatasets({ page, pageSize: PAGE_SIZE });
      setDatasets(r.datasets.items);
      setDatasetsTotal(r.datasets.total);
      setDatasetsPage(r.datasets.page);
    } catch (e: any) {
      setDatasetsError(e.message || tx("common.loadingFailed"));
    } finally {
      setDatasetsLoading(false);
    }
  }, [datasetsPage]);

  useEffect(() => {
    if (activeTab === "datasets") {
      void loadDatasets(datasetsPage);
    }
  }, [activeTab, datasetsPage, loadDatasets]);


  const filterPanel = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      { }
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column", gap: "16px" }}>
        <div>
          <FieldLabel color={fg3}>{tx("home.vendor")}</FieldLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {graphData.vendors.length === 0 && (
              <span style={{ fontFamily: SF_TEXT, fontSize: "12px", color: fg4 }}>{tx("home.loading")}</span>
            )}
            {[...graphData.vendors].sort().map((v) => (
              <label
                key={v}
                className="flex items-center gap-2 cursor-pointer"
                style={{ fontFamily: SF_TEXT, fontSize: "13px", color: fg2, minHeight: "28px" }}
              >
                <input
                  type="checkbox"
                  checked={filterVendors.includes(v)}
                  onChange={(e) => {
                    if (e.target.checked) setFilterVendors((prev) => [...prev, v]);
                    else setFilterVendors((prev) => prev.filter((x) => x !== v));
                  }}
                  style={{ accentColor: fg, width: "14px", height: "14px", cursor: "pointer" }}
                />
                {v}
              </label>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel color={fg3}>{tx("home.accessType")}</FieldLabel>
          <select
            value={filterAccessType}
            onChange={(e) => setFilterAccessType(e.target.value)}
            style={{ ...inputBaseStyle(fg, inputBg, inputBorder), appearance: "none" }}
          >
            <option value="">{tx("home.all")}</option>
            {ACCESS_TYPES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div>
          <FieldLabel color={fg3}>{tx("home.inferenceBackend")}</FieldLabel>
          <select
            value={filterBackend}
            onChange={(e) => setFilterBackend(e.target.value)}
            style={{ ...inputBaseStyle(fg, inputBg, inputBorder), appearance: "none" }}
          >
            <option value="">{tx("home.all")}</option>
            {BACKENDS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        <div>
          <FieldLabel color={fg3}>{tx("home.minScore")}</FieldLabel>
          <input
            type="number"
            value={filterMinScore}
            onChange={(e) => setFilterMinScore(e.target.value)}
            placeholder="如 60"
            min={0}
            max={100}
            style={inputBaseStyle(fg, inputBg, inputBorder)}
          />
        </div>

        <div>
          <FieldLabel color={fg3}>{tx("home.maxCostUsd")}</FieldLabel>
          <input
            type="number"
            value={filterMaxCost}
            onChange={(e) => setFilterMaxCost(e.target.value)}
            placeholder="如 10"
            min={0}
            step="any"
            style={inputBaseStyle(fg, inputBg, inputBorder)}
          />
        </div>
      </div>

      { }
      <div
        style={{
          display: "flex",
          gap: "10px",
          paddingTop: "16px",
          marginTop: "16px",
          borderTop: `1px solid ${divider}`,
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={applyFilter}
          disabled={graphLoading}
          className="transition-opacity duration-200 hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            flex: 1,
            fontFamily: SF_TEXT,
            fontSize: TYPE.body.fontSize,
            fontWeight: 500,
            letterSpacing: TYPE.body.letterSpacing,
            color: accentFg,
            background: accent,
            border: "none",
            borderRadius: "11px",
            padding: "8px 12px",
            minHeight: 36,
            cursor: graphLoading ? "not-allowed" : "pointer",
          }}
        >
          {tx("home.applyFilter")}
        </button>
        <button
          type="button"
          onClick={resetFilter}
          disabled={graphLoading}
          className="transition-opacity duration-200 hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            flex: 1,
            fontFamily: SF_TEXT,
            fontSize: TYPE.body.fontSize,
            fontWeight: 500,
            letterSpacing: TYPE.body.letterSpacing,
            color: fg2,
            background: inputBg,
            border: `3px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"}`,
            borderRadius: "11px",
            padding: "8px 12px",
            minHeight: 36,
            cursor: graphLoading ? "not-allowed" : "pointer",
          }}
        >
          {tx("home.resetFilter")}
        </button>
      </div>
    </div>
  );


  const detailPanel = (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {!selectedPoint ? (
        <div
          style={{
            fontFamily: SF_TEXT,
            fontSize: TYPE.body.fontSize,
            color: fg3,
            textAlign: "center",
            padding: "64px 16px",
            letterSpacing: TYPE.body.letterSpacing,
            lineHeight: TYPE.body.lineHeight,
          }}
        >
          {tx("home.clickBubbleHint")}
        </div>
      ) : (
        <>
          <div>
            <div
              style={{
                fontFamily: SF_DISPLAY,
                fontSize: TYPE.displaySm.fontSize,
                fontWeight: 600,
                color: fg,
                letterSpacing: TYPE.displaySm.letterSpacing,
                lineHeight: TYPE.displaySm.lineHeight,
                marginBottom: "8px",
              }}
            >
              {selectedPoint.name}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge bg={badgeBg} color={fg2}>
                {selectedPoint.vendor}
              </Badge>
              <Badge bg={badgeBg} color={fg2}>
                {selectedPoint.series}
              </Badge>
              <Badge bg={badgeBg} color={fg2} mono>
                v{selectedPoint.version}
              </Badge>
            </div>
          </div>

          <div>
            <div
              style={{
                fontFamily: SF_DISPLAY,
                fontSize: "28px",
                fontWeight: 600,
                color: fg,
                letterSpacing: "0.2px",
                lineHeight: 1.14,
              }}
            >
              {selectedPoint.compositeScore.toFixed(1)}
            </div>
            <div style={{ fontFamily: SF_TEXT, fontSize: "12px", color: fg3, marginTop: "4px", letterSpacing: "-0.1px" }}>{tx("home.compositeScore")}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "8px" }}>
            {[
              { label: tx("home.costPerTask"), value: formatCost(selectedPoint.costPerTask) },
              { label: tx("home.colInputPrice"), value: formatPrice(selectedPoint.inputPricePer1m, tx("home.pendingPrice")) },
              { label: tx("home.colOutputPrice"), value: formatPrice(selectedPoint.outputPricePer1m, tx("home.pendingPrice")) },
              { label: tx("home.latencyP50"), value: selectedPoint.latencyP50 == null ? "—" : `${selectedPoint.latencyP50.toFixed(0)}ms` },
              { label: tx("home.throughput"), value: selectedPoint.throughput == null ? "—" : `${selectedPoint.throughput.toFixed(1)}/s` },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  background: inputBg,
                  border: `1px solid ${divider}`,
                  borderRadius: "10px",
                  padding: "8px 10px",
                }}
              >
                <div style={{ fontFamily: SF_MONO, fontSize: "13px", fontWeight: 600, color: fg, letterSpacing: "-0.2px" }}>
                  {s.value}
                </div>
                <div style={{ fontFamily: SF_TEXT, fontSize: "10px", color: fg3, marginTop: "2px", letterSpacing: "0.02em" }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <FieldLabel color={fg3}>{tx("home.domainScores")}</FieldLabel>
            {selectedPoint.domainScores.map((ds) => (
              <DomainScoreBar key={ds.domain} ds={ds} fg={fg} fg2={fg2} fg3={fg3} divider={divider} />
            ))}
          </div>

          <PillButton
            primary
            fg={fg}
            fg3={fg3}
            accent={accent}
            accentFg={accentFg}
            divider={divider}
            onClick={() => addToCompare(selectedPoint)}
            disabled={compareList.some((x) => x.modelId === selectedPoint.modelId)}
          >
            {compareList.some((x) => x.modelId === selectedPoint.modelId) ? tx("home.alreadyCompared") : tx("home.joinCompare")}
          </PillButton>
        </>
      )}

      { }
      {compareList.length > 0 && (
        <div style={{ borderTop: `1px solid ${divider}`, paddingTop: "16px" }}>
          <FieldLabel color={fg3}>{tx("home.compareList", { n: compareList.length })}</FieldLabel>
          <div className="flex flex-wrap gap-1.5" style={{ marginBottom: "12px" }}>
            {compareList.map((p) => (
              <span
                key={p.modelId}
                className="inline-flex items-center gap-1.5"
                style={{
                  fontFamily: SF_TEXT,
                  fontSize: "12px",
                  color: fg,
                  background: badgeBg,
                  borderRadius: "980px",
                  padding: "4px 6px 4px 12px",
                  letterSpacing: "-0.1px",
                }}
              >
                {p.name}
                <button
                  onClick={() => removeFromCompare(p.modelId)}
                  aria-label={tx("home.removeNamed", { name: p.name })}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: fg3,
                    cursor: "pointer",
                    fontSize: "14px",
                    lineHeight: 1,
                    padding: "2px 6px",
                    borderRadius: "50%",
                    minWidth: "20px",
                    minHeight: "20px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <PillButton
            primary
            fg={fg}
            fg3={fg3}
            accent={accent}
            accentFg={accentFg}
            divider={divider}
            onClick={() => setShowCompare(true)}
            disabled={compareList.length < 2}
          >
            {tx("home.viewCompare")}
          </PillButton>
          {compareList.length < 2 && (
            <div style={{ fontFamily: SF_TEXT, fontSize: "12px", color: fg4, marginTop: "8px", letterSpacing: "-0.1px" }}>
              {tx("home.compareNeedTwoHint")}
            </div>
          )}
        </div>
      )}
    </div>
  );


  const canvasPanel = (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", minHeight: "420px" }}>
      { }
      {graphData.vendors.length > 0 && (
        <div
          className="flex flex-wrap items-center"
          style={{
            gap: "6px 14px",
            padding: "2px 4px 10px",
            borderBottom: `1px solid ${divider}`,
            marginBottom: "8px",
            flexShrink: 0,
          }}
        >
          {[...graphData.vendors].sort().map((v) => (
            <span key={v} className="inline-flex items-center gap-1.5">
              <span
                style={{
                  display: "inline-block",
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: vendorColor(v, graphData.vendors),
                }}
              />
              <span style={{ fontFamily: SF_TEXT, fontSize: "11px", color: fg2, letterSpacing: "-0.1px" }}>{v}</span>
            </span>
          ))}
          {graphData.frontier.length >= 2 && (
            <span className="inline-flex items-center gap-1.5">
              <svg width="16" height="8" style={{ display: "inline-block" }}>
                <line x1="0" y1="4" x2="16" y2="4" stroke={PARETO_COLOR} strokeOpacity={PARETO_STROKE_OPACITY} strokeWidth="1.5" strokeDasharray="4 3" />
              </svg>
              <span style={{ fontFamily: SF_TEXT, fontSize: "11px", color: fg2, letterSpacing: "-0.1px" }}>{tx("home.paretoFront")}</span>
            </span>
          )}
        </div>
      )}
      <div ref={observeCanvas} style={{ position: "relative", width: "100%", flex: 1, minHeight: 0 }}>
      {graphData.points.length === 0 && !graphLoading ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            padding: "48px 24px",
            fontFamily: SF_TEXT,
            fontSize: "15px",
            color: fg3,
            letterSpacing: "-0.15px",
            lineHeight: 1.45,
            textAlign: "center",
          }}
        >
          {tx("home.emptyEvalData")}
        </div>
      ) : (
        <svg width={geom.W} height={geom.H} style={{ display: "block" }}>
          { }
          {geom.yTicks.map((v) => (
            <line
              key={`gy-${v}`}
              x1={geom.ML}
              x2={geom.W - geom.MR}
              y1={geom.toY(v)}
              y2={geom.toY(v)}
              stroke={fg}
              strokeOpacity={0.06}
              strokeWidth={1}
            />
          ))}
          {geom.xTicks.map((e) => (
            <line
              key={`gx-${e}`}
              x1={geom.toX(Math.pow(10, e))}
              x2={geom.toX(Math.pow(10, e))}
              y1={geom.MT}
              y2={geom.H - geom.MB}
              stroke={fg}
              strokeOpacity={0.06}
              strokeWidth={1}
            />
          ))}

          { }
          <line x1={geom.ML} x2={geom.W - geom.MR} y1={geom.H - geom.MB} y2={geom.H - geom.MB} stroke={fg} strokeOpacity={0.25} strokeWidth={1} />
          <line x1={geom.ML} x2={geom.ML} y1={geom.MT} y2={geom.H - geom.MB} stroke={fg} strokeOpacity={0.25} strokeWidth={1} />

          { }
          {geom.xTicks.map((e) => {
            const v = Math.pow(10, e);
            const x = geom.toX(v);
            let label: string;
            if (v >= 1) label = `$${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}`;
            else label = `$${v.toFixed(Math.abs(e))}`;
            return (
              <text
                key={`tx-${e}`}
                x={x}
                y={geom.H - geom.MB + 18}
                textAnchor="middle"
                style={{ fontFamily: SF_MONO, fontSize: "10px", fill: fg3 }}
              >
                {label}
              </text>
            );
          })}
          {geom.yTicks.map((v) => (
            <text
              key={`ty-${v}`}
              x={geom.ML - 8}
              y={geom.toY(v) + 3}
              textAnchor="end"
              style={{ fontFamily: SF_MONO, fontSize: "10px", fill: fg3 }}
            >
              {v}
            </text>
          ))}

          { }
          <text
            x={geom.ML + geom.plotW / 2}
            y={geom.H - 8}
            textAnchor="middle"
            style={{ fontFamily: SF_TEXT, fontSize: "11px", fill: fg3, letterSpacing: "0.02em" }}
          >
            {tx("home.axisCostLog")}
          </text>
          <text
            x={14}
            y={geom.MT + geom.plotH / 2}
            textAnchor="middle"
            transform={`rotate(-90, 14, ${geom.MT + geom.plotH / 2})`}
            style={{ fontFamily: SF_TEXT, fontSize: "11px", fill: fg3, letterSpacing: "0.02em" }}
          >{tx("home.compositeScore")}</text>

          { }
          {geom.seriesLines.map((line, i) => (
            <polyline
              key={`series-${i}`}
              points={line.pts.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={vendorColor(line.vendor, graphData.vendors)}
              strokeOpacity={SERIES_STROKE_OPACITY}
              strokeWidth={1.2}
            />
          ))}

          { }
          {geom.frontierPts.length >= 2 && (() => {
            const pts = geom.frontierPts;
            const bottom = geom.H - geom.MB;
            const right = geom.W - geom.MR;
            let stair = `M ${pts[0].x},${pts[0].y}`;
            for (let i = 1; i < pts.length; i++) stair += ` H ${pts[i].x} V ${pts[i].y}`;
            const area = `${stair} H ${right} V ${bottom} H ${pts[0].x} Z`;
            const last = pts[pts.length - 1];
            return (
              <>
                { }
                <motion.path
                  d={area}
                  fill={PARETO_COLOR}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.045 }}
                  transition={{ duration: 0.8, delay: 0.5, ease }}
                  style={{ pointerEvents: "none" }}
                />
                <motion.path
                  d={stair}
                  fill="none"
                  stroke={PARETO_COLOR}
                  strokeOpacity={PARETO_STROKE_OPACITY}
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.8, delay: 0.3, ease }}
                />
                { }
                {pts.map((p, i) => (
                  <circle
                    key={`fp-${i}`}
                    cx={p.x}
                    cy={p.y}
                    r={3}
                    fill={PARETO_COLOR}
                    fillOpacity={0.9}
                    style={{ pointerEvents: "none" }}
                  />
                ))}
                { }
                <text
                  x={Math.min(last.x + 4, right)}
                  y={last.y - 10}
                  textAnchor="end"
                  style={{ fontFamily: SF_TEXT, fontSize: "10px", fill: PARETO_COLOR, letterSpacing: "0.02em", fontWeight: 600 }}
                >
                  {tx("home.paretoBest")}
                </text>
                { }
                <text
                  x={right - 6}
                  y={bottom - 8}
                  textAnchor="end"
                  style={{ fontFamily: SF_TEXT, fontSize: "10px", fill: PARETO_COLOR, opacity: 0.45, letterSpacing: "0.02em" }}
                >
                  {tx("home.dominatedHint")}
                </text>
              </>
            );
          })()}

          { }
          {hoverPoint && (
            <g style={{ pointerEvents: "none" }}>
              <line
                x1={geom.ML}
                x2={hoverPoint.cx}
                y1={hoverPoint.cy}
                y2={hoverPoint.cy}
                stroke={fg}
                strokeOpacity={0.18}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <line
                x1={hoverPoint.cx}
                x2={hoverPoint.cx}
                y1={hoverPoint.cy}
                y2={geom.H - geom.MB}
                stroke={fg}
                strokeOpacity={0.18}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <text
                x={geom.ML - 8}
                y={hoverPoint.cy + 3}
                textAnchor="end"
                style={{ fontFamily: SF_MONO, fontSize: "10px", fill: fg, fontWeight: 600 }}
              >
                {hoverPoint.point.compositeScore.toFixed(1)}
              </text>
              <text
                x={hoverPoint.cx}
                y={geom.H - geom.MB + 18}
                textAnchor="middle"
                style={{ fontFamily: SF_MONO, fontSize: "10px", fill: fg, fontWeight: 600 }}
              >
                {formatCost(hoverPoint.point.costPerTask)}
              </text>
            </g>
          )}

          { }
          {graphData.points.map((p, idx) => {
            const cx = geom.toX(p.costPerTask);
            const cy = geom.toY(p.compositeScore);
            const color = vendorColor(p.vendor, graphData.vendors);
            const isHovered = hoverPoint?.point.modelId === p.modelId;
            const isSelected = selectedPoint?.modelId === p.modelId;
            const r = isHovered ? 12 : 9;
            return (
              <g key={p.modelId}>
                { }
                {(isHovered || isSelected) && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r + 9}
                    fill={color}
                    fillOpacity={isHovered ? 0.22 : 0.14}
                    style={{ pointerEvents: "none" }}
                  />
                )}
                <motion.circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={color}
                  fillOpacity={BUBBLE_FILL_OPACITY}
                  stroke={isSelected ? accent : p.onFrontier ? PARETO_COLOR : "none"}
                  strokeWidth={isSelected || p.onFrontier ? 2 : 0}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.15 + idx * 0.035, ease }}
                  style={{
                    cursor: "pointer",
                    transformOrigin: `${cx}px ${cy}px`,
                    transition: "r 0.2s cubic-bezier(0.25,0.4,0.25,1)",
                  }}
                  onMouseEnter={() => setHoverPoint({ point: p, cx, cy })}
                  onMouseLeave={() => setHoverPoint(null)}
                  onClick={() => setSelectedPoint(p)}
                />
              </g>
            );
          })}
        </svg>
      )}

      { }
      {hoverPoint && (
        <div
          style={{
            position: "absolute",
            left: Math.min(hoverPoint.cx + 14, geom.W - 180),
            top: Math.max(hoverPoint.cy - 10, 8),
            background: card,
            border: `1px solid ${divider}`,
            borderRadius: "12px",
            boxShadow: cardShadow,
            padding: "10px 14px",
            pointerEvents: "none",
            zIndex: 10,
            minWidth: "160px",
          }}
        >
          <div style={{ fontFamily: SF_DISPLAY, fontSize: "13px", fontWeight: 600, color: fg, letterSpacing: "-0.2px", marginBottom: "4px" }}>
            {hoverPoint.point.name}
          </div>
          <div style={{ fontFamily: SF_TEXT, fontSize: "11px", color: fg3, marginBottom: "6px" }}>
            {hoverPoint.point.vendor}
          </div>
          {hoverPoint.point.onFrontier && (
            <div style={{ fontFamily: SF_TEXT, fontSize: "10px", color: PARETO_COLOR, fontWeight: 600, letterSpacing: "0.02em", marginBottom: "6px" }}>
              {tx("home.paretoLegend")}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "2px 10px", fontFamily: SF_MONO, fontSize: "11px", color: fg2 }}>
            <span style={{ color: fg3 }}>{tx("home.scoreShort")}</span>
            <span>{hoverPoint.point.compositeScore.toFixed(1)}</span>
            <span style={{ color: fg3 }}>{tx("home.costShort")}</span>
            <span>{formatCost(hoverPoint.point.costPerTask)}</span>
            <span style={{ color: fg3 }}>{tx("home.colInputPrice")}</span>
            <span>{formatPrice(hoverPoint.point.inputPricePer1m, tx("home.pendingPrice"))}</span>
            <span style={{ color: fg3 }}>{tx("home.colOutputPrice")}</span>
            <span>{formatPrice(hoverPoint.point.outputPricePer1m, tx("home.pendingPrice"))}</span>
            <span style={{ color: fg3 }}>P50</span>
            <span>{hoverPoint.point.latencyP50 == null ? "—" : `${hoverPoint.point.latencyP50.toFixed(0)}ms`}</span>
            <span style={{ color: fg3 }}>{tx("home.throughput")}</span>
            <span>{hoverPoint.point.throughput == null ? "—" : `${hoverPoint.point.throughput.toFixed(1)}/s`}</span>
            <span style={{ color: fg3 }}>{tx("home.valueForMoney")}</span>
            <span>#{hoverPoint.point.valueRank}</span>
          </div>
        </div>
      )}

      </div>
    </div>
  );


  const statusBadge = (status: string) => {
    if (status === "Running") {
      return (
        <Badge bg={accent} color={accentFg}>
          <span className="inline-flex items-center gap-1.5">
            Running
            <LoadingDots size="sm" />
          </span>
        </Badge>
      );
    }
    if (status === "Done") {
      return (
        <Badge bg="transparent" color={fg} border={fg}>
          Done
        </Badge>
      );
    }
    if (status === "Failed") {
      return (
        <Badge bg="transparent" color={ERROR_COLOR} border={ERROR_COLOR}>
          Failed
        </Badge>
      );
    }
    if (status === "Paused") {
      return (
        <Badge bg={badgeBg} color={fg2}>
          Paused
        </Badge>
      );
    }
    if (status === "Pending") {
      return (
        <Badge bg={badgeBg} color={fg3}>
          Pending
        </Badge>
      );
    }
    return (
      <Badge bg={badgeBg} color={fg3}>
        {status}
      </Badge>
    );
  };

  const tasksPanel = (
    <div>
      { }
      <div className="flex items-center justify-between flex-wrap gap-3" style={{ marginBottom: "24px" }}>
        <div className="flex items-center gap-3">
          <select
            value={taskStatusFilter}
            onChange={(e) => {
              setTaskStatusFilter(e.target.value);
              setTasksPage(1);
            }}
            style={{ ...inputBaseStyle(fg, inputBg, inputBorder), width: "auto", minWidth: "130px", appearance: "none" }}
            aria-label={tx("a11y.statusFilter")}
          >
            <option value="">{tx("home.allStatuses")}</option>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {actionMessage && (
            <span style={{ fontFamily: SF_TEXT, fontSize: "14px", color: fg2, letterSpacing: "-0.22px" }}>{actionMessage}</span>
          )}
        </div>
        <PillButton primary fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={() => void openCreateTask()}>{tx("home.newEvalTask")}</PillButton>
      </div>

      { }
      {tasksError && (
        <div style={{ fontFamily: SF_TEXT, fontSize: "14px", color: error, marginBottom: "12px" }}>{tasksError}</div>
      )}
      {tasks.length === 0 && !tasksLoading ? (
        <div style={{ fontFamily: SF_TEXT, fontSize: "14px", color: fg3, textAlign: "center", padding: "64px 16px", letterSpacing: "-0.15px", lineHeight: 1.45 }}>{tx("home.noTasks")}</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: SF_TEXT, fontSize: "14px" }}>
            <thead>
              <tr>
                {[tx("home.tableTaskId"), tx("home.tableName"), tx("home.model"), tx("home.tableBackend"), tx("home.status"), tx("home.tableProgress"), tx("home.tableActions")].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      color: fg3,
                      fontWeight: 600,
                      padding: "10px 14px 10px 0",
                      borderBottom: `1px solid ${divider}`,
                      fontSize: "12px",
                      letterSpacing: "0.02em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks.map((tk) => (
                <tr key={tk.taskUid} data-row>
                  <td style={{ padding: "11px 14px 11px 0", borderBottom: `1px solid ${divider}`, fontFamily: SF_MONO, fontSize: "11px", color: fg3, whiteSpace: "nowrap" }}>
                    {tk.taskUid}
                  </td>
                  <td style={{ padding: "11px 14px 11px 0", borderBottom: `1px solid ${divider}`, color: fg, fontWeight: 500, letterSpacing: "-0.1px", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {tk.name}
                  </td>
                  <td style={{ padding: "11px 14px 11px 0", borderBottom: `1px solid ${divider}`, color: fg2, letterSpacing: "-0.1px", whiteSpace: "nowrap" }}>
                    {tk.modelName}
                    <span style={{ color: fg4, marginLeft: "6px", fontSize: "11px" }}>{tk.modelVendor}</span>
                  </td>
                  <td style={{ padding: "11px 14px 11px 0", borderBottom: `1px solid ${divider}`, color: fg2, fontFamily: SF_MONO, fontSize: "12px", whiteSpace: "nowrap" }}>
                    {tk.backend}
                  </td>
                  <td style={{ padding: "11px 14px 11px 0", borderBottom: `1px solid ${divider}`, whiteSpace: "nowrap" }}>
                    {statusBadge(tk.status)}
                    {tk.status === "Failed" && (tk.errorType || tk.error) && (
                      <div title={tk.error || ""} style={{ color: error, fontSize: "10px", marginTop: "4px", maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {tk.errorType || "UNKNOWN"}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "11px 14px 11px 0", borderBottom: `1px solid ${divider}`, minWidth: "90px" }}>
                    {tk.status === "Running" || tk.status === "Paused" ? (
                      <div className="flex items-center gap-2">
                        <div style={{ flex: 1, height: "3px", borderRadius: "2px", background: divider, overflow: "hidden" }}>
                          <div
                            style={{
                              height: "100%",
                              width: `${Math.max(0, Math.min(100, tk.progress))}%`,
                              background: fg,
                              borderRadius: "2px",
                              transition: "width 0.4s cubic-bezier(0.25,0.4,0.25,1)",
                            }}
                          />
                        </div>
                        <span style={{ fontFamily: SF_MONO, fontSize: "11px", color: fg2 }}>{tk.progress.toFixed(0)}%</span>
                      </div>
                    ) : (
                      <span style={{ color: fg4, fontSize: "12px" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 0", borderBottom: `1px solid ${divider}`, whiteSpace: "nowrap" }}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {tk.status === "Running" && (
                        <PillButton small fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={() => void taskAction(tk.taskUid, "pause")}>{tx("home.pause")}</PillButton>
                      )}
                      {tk.status === "Paused" && (
                        <PillButton small fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={() => void taskAction(tk.taskUid, "resume")}>{tx("home.resume")}</PillButton>
                      )}
                      {tk.status === "Failed" && (
                        <PillButton small fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={() => void taskAction(tk.taskUid, "resume")}>{tx("home.rerun")}</PillButton>
                      )}
                      {tk.status === "Done" && (
                        <PillButton small fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={() => void openReport(tk.taskUid)}>{tx("home.report")}</PillButton>
                      )}
                      <PillButton
                        small
                        fg={fg}
                        fg3={fg3}
                        accent={accent}
                        accentFg={accentFg}
                        divider={divider}
                        onClick={() => {
                          if (window.confirm(tx("home.deleteTaskConfirm", { name: tk.name }))) {
                            void taskAction(tk.taskUid, "delete");
                          }
                        }}
                      >
                        {tx("home.delete")}
                      </PillButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tasksLoading && tasks.length === 0 && (
        <div style={{ display: "flex", justifyContent: "center", padding: "24px" }}>
          <LoadingDots color="bg-current" />
        </div>
      )}
      <PaginationBar
        page={tasksPage}
        pageSize={PAGE_SIZE}
        total={tasksTotal}
        onChange={setTasksPage}
        fg={fg}
        fg3={fg3}
        accent={accent}
        accentFg={accentFg}
        divider={divider}
        prevLabel={tx("home.pagePrev")}
        nextLabel={tx("home.pageNext")}
        summary={tx("home.pageSummary", { total: tasksTotal, page: tasksPage, size: PAGE_SIZE })}
      />
    </div>
  );


  const modelsPanel = (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3" style={{ marginBottom: "16px" }}>
        {modelsNotice ? (
          <span style={{ fontFamily: SF_TEXT, fontSize: "14px", color: fg2, letterSpacing: "-0.22px" }}>{modelsNotice}</span>
        ) : (
          <span style={{ fontFamily: SF_TEXT, fontSize: "13px", color: fg3, letterSpacing: "-0.1px" }}>
            {tx("home.modelFilterResult", { n: modelsTotal })}
          </span>
        )}
        <PillButton primary fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={openRegisterModel}>{tx("home.registerModel")}</PillButton>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          applyModelsFilter();
        }}
        style={{
          display: "grid",
          gridTemplateColumns: isNarrow ? "1fr" : "1.4fr 1fr 1fr 1fr auto",
          gap: "10px",
          alignItems: "end",
          marginBottom: "20px",
        }}
      >
        <div>
          <FieldLabel color={fg3}>{tx("home.modelFilterKeyword")}</FieldLabel>
          <input
            value={mfQ}
            onChange={(e) => setMfQ(e.target.value)}
            placeholder={tx("home.modelFilterKeywordPlaceholder")}
            style={inputBaseStyle(fg, inputBg, inputBorder)}
          />
        </div>
        <div>
          <FieldLabel color={fg3}>{tx("home.modelFilterName")}</FieldLabel>
          <input
            value={mfName}
            onChange={(e) => setMfName(e.target.value)}
            placeholder={tx("home.modelFilterName")}
            style={inputBaseStyle(fg, inputBg, inputBorder)}
          />
        </div>
        <div>
          <FieldLabel color={fg3}>{tx("home.modelFilterVendor")}</FieldLabel>
          <input
            value={mfVendor}
            onChange={(e) => setMfVendor(e.target.value)}
            placeholder={tx("home.modelFilterVendor")}
            style={inputBaseStyle(fg, inputBg, inputBorder)}
          />
        </div>
        <div>
          <FieldLabel color={fg3}>{tx("home.modelFilterSeries")}</FieldLabel>
          <input
            value={mfSeries}
            onChange={(e) => setMfSeries(e.target.value)}
            placeholder={tx("home.modelFilterSeries")}
            style={inputBaseStyle(fg, inputBg, inputBorder)}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap" style={{ paddingBottom: "1px" }}>
          <PillButton
            type="submit"
            primary
            fg={fg}
            fg3={fg3}
            accent={accent}
            accentFg={accentFg}
            divider={divider}
          >
            {tx("home.modelFilterApply")}
          </PillButton>
          <PillButton
            fg={fg}
            fg3={fg3}
            accent={accent}
            accentFg={accentFg}
            divider={divider}
            onClick={resetModelsFilter}
            disabled={!modelsFilterActive && !mfQ && !mfName && !mfVendor && !mfSeries}
          >
            {tx("home.modelFilterReset")}
          </PillButton>
        </div>
      </form>

      {modelsError && (
        <div style={{ fontFamily: SF_TEXT, fontSize: "14px", color: error, marginBottom: "12px" }}>{modelsError}</div>
      )}
      {models.length === 0 && !modelsLoading ? (
        <div style={{ fontFamily: SF_TEXT, fontSize: "14px", color: fg3, textAlign: "center", padding: "64px 16px", letterSpacing: "-0.15px", lineHeight: 1.45 }}>
          {modelsFilterActive ? tx("home.noModelsMatched") : tx("home.noModels")}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: SF_TEXT, fontSize: "14px" }}>
            <thead>
              <tr>
                {[tx("home.tableName"), tx("home.tableVendor"), tx("home.tableSeries"), tx("home.tableVersion"), tx("home.colBaseUrl"), tx("home.colApiKey"), tx("home.colModelName"), tx("home.colInputPrice"), tx("home.colOutputPrice"), tx("home.colActions")].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      color: fg3,
                      fontWeight: 600,
                      padding: "10px 14px 10px 0",
                      borderBottom: `1px solid ${divider}`,
                      fontSize: "12px",
                      letterSpacing: "0.02em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id} data-row>
                  <td style={{ padding: "11px 14px 11px 0", borderBottom: `1px solid ${divider}`, color: fg, fontWeight: 500, letterSpacing: "-0.1px", whiteSpace: "nowrap" }}>
                    {m.name}
                  </td>
                  <td style={{ padding: "11px 14px 11px 0", borderBottom: `1px solid ${divider}`, color: fg2, whiteSpace: "nowrap" }}>
                    {m.vendor}
                  </td>
                  <td style={{ padding: "11px 14px 11px 0", borderBottom: `1px solid ${divider}`, color: fg2, whiteSpace: "nowrap" }}>
                    {m.series}
                  </td>
                  <td style={{ padding: "11px 14px 11px 0", borderBottom: `1px solid ${divider}`, color: fg2, fontFamily: SF_MONO, fontSize: "12px", whiteSpace: "nowrap" }}>
                    {m.version}
                  </td>
                  <td style={{ padding: "11px 14px 11px 0", borderBottom: `1px solid ${divider}`, color: fg2, fontFamily: SF_MONO, fontSize: "11px", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m.baseUrl}>
                    {m.baseUrl || "—"}
                  </td>
                  <td style={{ padding: "11px 14px 11px 0", borderBottom: `1px solid ${divider}`, color: fg3, fontFamily: SF_MONO, fontSize: "11px", whiteSpace: "nowrap" }}>
                    {m.apiKeyMasked || "—"}
                  </td>
                  <td style={{ padding: "11px 14px 11px 0", borderBottom: `1px solid ${divider}`, color: fg2, fontFamily: SF_MONO, fontSize: "12px", whiteSpace: "nowrap" }}>
                    {m.modelName || "—"}
                  </td>
                  <td style={{ padding: "11px 14px 11px 0", borderBottom: `1px solid ${divider}`, color: m.inputPricePer1m == null ? error : fg2, fontFamily: SF_MONO, fontSize: "12px", whiteSpace: "nowrap" }}>
                    {formatPrice(m.inputPricePer1m, tx("home.pendingPrice"))}
                  </td>
                  <td style={{ padding: "11px 14px 11px 0", borderBottom: `1px solid ${divider}`, color: m.outputPricePer1m == null ? error : fg2, fontFamily: SF_MONO, fontSize: "12px", whiteSpace: "nowrap" }}>
                    {formatPrice(m.outputPricePer1m, tx("home.pendingPrice"))}
                  </td>
                  <td style={{ padding: "10px 0", borderBottom: `1px solid ${divider}`, whiteSpace: "nowrap" }}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <PillButton
                        small
                        fg={fg}
                        fg3={fg3}
                        accent={accent}
                        accentFg={accentFg}
                        divider={divider}
                        onClick={() => openEditModel(m)}
                      >
                        {tx("home.edit")}
                      </PillButton>
                      <PillButton
                        small
                        fg={fg}
                        fg3={fg3}
                        accent={accent}
                        accentFg={accentFg}
                        divider={divider}
                        onClick={() => {
                          if (
                            window.confirm(
                              tx("home.deleteModelConfirm", {
                                name: m.name,
                                version: m.version,
                              }),
                            )
                          ) {
                            void deleteModel(m.id);
                          }
                        }}
                      >
                        {tx("home.delete")}
                      </PillButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modelsLoading && models.length === 0 && (
        <div style={{ display: "flex", justifyContent: "center", padding: "24px" }}>
          <LoadingDots color="bg-current" />
        </div>
      )}
      <PaginationBar
        page={modelsPage}
        pageSize={PAGE_SIZE}
        total={modelsTotal}
        onChange={(p) => {
          setModelsPage(p);
          void loadModels(undefined, p);
        }}
        fg={fg}
        fg3={fg3}
        accent={accent}
        accentFg={accentFg}
        divider={divider}
        prevLabel={tx("home.pagePrev")}
        nextLabel={tx("home.pageNext")}
        summary={tx("home.pageSummary", { total: modelsTotal, page: modelsPage, size: PAGE_SIZE })}
      />
    </div>
  );


  const datasetsPanel = (
    <div>
      {datasetsError && (
        <div style={{ fontFamily: SF_TEXT, fontSize: "14px", color: error, marginBottom: "12px" }}>{datasetsError}</div>
      )}
      {datasets.length === 0 && !datasetsLoading ? (
        <div style={{ fontFamily: SF_TEXT, fontSize: "14px", color: fg3, textAlign: "center", padding: "64px 16px", letterSpacing: "-0.15px", lineHeight: 1.45 }}>{tx("home.noDatasets")}</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr",
            gap: "16px",
          }}
        >
          {datasets.map((d) => (
            <Card key={d.id} bg={card} noPadding>
              <div style={{ padding: "24px 28px" }}>
                <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: "6px" }}>
                  <span style={{ fontFamily: SF_DISPLAY, fontSize: "17px", fontWeight: 600, color: fg, letterSpacing: "-0.34px" }}>
                    {d.name}
                  </span>
                  <Badge bg={badgeBg} color={fg2} mono>
                    v{d.version}
                  </Badge>
                  <Badge bg={badgeBg} color={fg2}>
                    {d.domain}
                  </Badge>
                </div>
                <div style={{ fontFamily: SF_MONO, fontSize: "11px", color: fg3, marginBottom: "8px" }}>
                  {d.snapshot}
                </div>
                <div style={{ fontFamily: SF_TEXT, fontSize: "14px", color: fg2, letterSpacing: "-0.22px", marginBottom: "10px", lineHeight: 1.5 }}>
                  {d.description}
                </div>
                <div style={{ fontFamily: SF_TEXT, fontSize: "12px", color: fg3, letterSpacing: "-0.1px" }}>
                  {tx("home.samples", { count: formatCount(d.sampleCount) })}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {datasetsLoading && datasets.length === 0 && (
        <div style={{ display: "flex", justifyContent: "center", padding: "24px" }}>
          <LoadingDots color="bg-current" />
        </div>
      )}
      <PaginationBar
        page={datasetsPage}
        pageSize={PAGE_SIZE}
        total={datasetsTotal}
        onChange={setDatasetsPage}
        fg={fg}
        fg3={fg3}
        accent={accent}
        accentFg={accentFg}
        divider={divider}
        prevLabel={tx("home.pagePrev")}
        nextLabel={tx("home.pageNext")}
        summary={tx("home.pageSummary", { total: datasetsTotal, page: datasetsPage, size: PAGE_SIZE })}
      />
    </div>
  );


  const modelVendorGroups = useMemo(() => {
    const map = new Map<string, ModelItem[]>();
    for (const m of ctModels) {
      if (!map.has(m.vendor)) map.set(m.vendor, []);
      map.get(m.vendor)!.push(m);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [ctModels]);


    return (
    <div className="workspace-shell" style={{ background: bg }}>
      <nav
        className="flex items-center justify-between shrink-0 z-50 sticky top-0"
        style={{
          height: "48px",
          padding: "0 24px",
          background: navBg,
          backdropFilter: "saturate(180%) blur(20px)",
          WebkitBackdropFilter: "saturate(180%) blur(20px)",
          borderBottom: `0.5px solid ${divider}`,
        }}
      >
        <div className="flex items-center gap-4" style={{ minWidth: 0 }}>
          <div className="flex items-center gap-2.5 shrink-0">
            { }
            <img src="/favicon.ico" alt="logo" style={{ width: 22, height: 22 }} />
            <span style={{ fontFamily: SF_DISPLAY, fontSize: "17px", fontWeight: 600, color: fg, letterSpacing: "-0.374px", whiteSpace: "nowrap" }}>{tx("home.brand")}</span>
          </div>

          <div className="flex items-center gap-1" style={{ marginLeft: "10px" }}>
            {tabs.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className="transition-colors duration-200"
                  style={{
                    position: "relative",
                    fontFamily: SF_TEXT,
                    fontSize: TYPE.body.fontSize,
                    fontWeight: active ? 600 : 400,
                    letterSpacing: TYPE.body.letterSpacing,
                    color: active ? fg : fg3,
                    background: "transparent",
                    border: "none",
                    borderRadius: "980px",
                    padding: "5px 12px",
                    cursor: "pointer",
                    minHeight: "36px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-tab-pill"
                      transition={{ type: "spring", stiffness: 500, damping: 38 }}
                      style={{
                        position: "absolute",
                        inset: "3px 0",
                        background: badgeBg,
                        borderRadius: "980px",
                        boxShadow: isDark ? "inset 0 1px 0 rgba(255,255,255,0.08)" : "inset 0 1px 0 rgba(255,255,255,0.7)",
                      }}
                    />
                  )}
                  <span style={{ position: "relative" }}>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {userEmail && (
            <span
              style={{
                fontFamily: SF_TEXT,
                fontSize: "12px",
                color: fg3,
                letterSpacing: "-0.1px",
                maxWidth: "160px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {userEmail}
            </span>
          )}
          <div className="flex items-center gap-0.5">
            <LocaleToggle />
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setShowLogoutConfirm(true)}
              className={toggleButtonClass(isDark)}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: fg2,
              }}
              aria-label={tx("home.logout")}
              title={tx("home.logout")}
            >
              <svg className={TOGGLE_ICON_BOX} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M16 17l5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      <main className="workspace-main overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10, scale: 0.995 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.995 }}
            transition={{ duration: 0.35, ease }}
            style={{ height: "100%" }}
          >
            {activeTab === "graph" && (
              <div className="h-full overflow-y-auto">
                <div style={{ padding: isNarrow ? "16px" : "20px 20px 24px", height: isNarrow ? undefined : "100%", boxSizing: "border-box" }}>
                  {isNarrow && (
                    <div style={{ marginBottom: "12px" }}>
                      <PillButton small fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={() => setShowFilterPanel((v) => !v)}>
                        {showFilterPanel ? tx("home.collapseFilter") : tx("home.expandFilter")}
                      </PillButton>
                    </div>
                  )}
                  <div
                    style={{
                      display: isNarrow ? "grid" : "flex",
                      gridTemplateColumns: isNarrow ? "1fr" : undefined,
                      gap: isNarrow ? "16px" : 0,
                      alignItems: "stretch",
                      height: isNarrow ? undefined : "calc(100dvh - 92px)",
                      minHeight: isNarrow ? undefined : 0,
                    }}
                  >
                    {(!isNarrow || showFilterPanel) && (
                      <div
                        style={{
                          width: isNarrow ? "100%" : graphLeftWidth,
                          flexShrink: 0,
                          minWidth: 0,
                          height: isNarrow ? undefined : "100%",
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        <Card bg={card} noPadding style={{ height: isNarrow ? undefined : "100%", minHeight: 0, flex: 1 }}>
                          <div style={{ padding: PANEL_PAD, height: isNarrow ? undefined : "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>{filterPanel}</div>
                        </Card>
                      </div>
                    )}

                    {!isNarrow && (
                      <ColResizeHandle
                        divider={divider}
                        label={tx("home.resizeFilter")}
                        onMouseDown={beginGraphResize("left")}
                      />
                    )}

                    <div
                      style={{
                        flex: isNarrow ? undefined : "1 1 auto",
                        width: isNarrow ? "100%" : undefined,
                        minWidth: isNarrow ? 0 : 280,
                        height: isNarrow ? undefined : "100%",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <Card bg={card} noPadding style={{ height: isNarrow ? undefined : "100%", minHeight: isNarrow ? "440px" : 0, flex: 1 }}>
                        <div style={{ padding: "12px", height: isNarrow ? undefined : "100%", boxSizing: "border-box", minHeight: isNarrow ? "440px" : 0, position: "relative" }}>
                          {graphLoading && graphData.points.length === 0 ? (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", minHeight: "400px" }}>
                              <LoadingDots color="bg-current" />
                            </div>
                          ) : (
                            canvasPanel
                          )}
                          {graphError && (
                            <div style={{ position: "absolute", top: "10px", left: "10px", fontFamily: SF_TEXT, fontSize: "12px", color: error }}>{graphError}</div>
                          )}
                        </div>
                      </Card>
                    </div>

                    {!isNarrow && (
                      <ColResizeHandle
                        divider={divider}
                        label={tx("home.resizeDetail")}
                        onMouseDown={beginGraphResize("right")}
                      />
                    )}

                    <div
                      style={{
                        width: isNarrow ? "100%" : graphRightWidth,
                        flexShrink: 0,
                        minWidth: 0,
                        height: isNarrow ? undefined : "100%",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <Card bg={card} noPadding style={{ height: isNarrow ? undefined : "100%", minHeight: 0, flex: 1 }}>
                        <div style={{ padding: PANEL_PAD, height: isNarrow ? undefined : "100%", boxSizing: "border-box", overflowY: "auto" }}>{detailPanel}</div>
                      </Card>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "tasks" && (
              <div className="h-full overflow-y-auto">
                <div className="workspace-column">
                  <Card bg={card} noPadding>
                    <div style={{ padding: PANEL_PAD }}>{tasksPanel}</div>
                  </Card>
                </div>
              </div>
            )}

            {activeTab === "models" && (
              <div className="h-full overflow-y-auto">
                <div className="workspace-column">
                  <Card bg={card} noPadding>
                    <div style={{ padding: PANEL_PAD }}>{modelsPanel}</div>
                  </Card>
                </div>
              </div>
            )}

            {activeTab === "datasets" && (
              <div className="h-full overflow-y-auto">
                <div className="workspace-column">{datasetsPanel}</div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      { }
      <Modal state={{ isOpen: showLogoutConfirm, setOpen: setShowLogoutConfirm, open: () => setShowLogoutConfirm(true), close: () => setShowLogoutConfirm(false), toggle: () => setShowLogoutConfirm((prev) => !prev) }}>
        <Modal.Backdrop variant="blur">
          <Modal.Container placement="center" size="sm" className="flex items-center justify-center">
            <Modal.Dialog
              style={{
                background: card,
                borderRadius: "12px",
                boxShadow: "none",
                border: `1px solid ${divider}`,
                padding: "16px 20px 18px",
              }}
            >
              <Modal.Header>
                <Modal.Heading
                  style={{
                    fontFamily: SF_DISPLAY,
                    fontSize: "21px",
                    fontWeight: 600,
                    color: fg,
                    letterSpacing: "0.23px",
                    lineHeight: 1.19,
                  }}
                >{tx("home.logoutConfirmTitle")}</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <p style={{ fontFamily: SF_TEXT, fontSize: "14px", color: fg2, letterSpacing: "-0.15px", margin: 0 }}>{tx("home.logoutConfirmBody")}</p>
              </Modal.Body>
              <Modal.Footer style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <PillButton fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={() => setShowLogoutConfirm(false)}>{tx("home.cancel")}</PillButton>
                <PillButton primary fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={() => void handleLogout()}>{tx("home.logout")}</PillButton>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      { }
      <Modal state={{ isOpen: showCreateTask, setOpen: setShowCreateTask, open: () => setShowCreateTask(true), close: () => setShowCreateTask(false), toggle: () => setShowCreateTask((prev) => !prev) }}>
        <Modal.Backdrop variant="blur">
          <Modal.Container placement="center" size="md" scroll="inside" className="flex items-center justify-center">
            <Modal.Dialog
              style={{
                background: card,
                borderRadius: "12px",
                boxShadow: "none",
                border: `1px solid ${divider}`,
                padding: "16px 20px 18px",
              }}
            >
              <Modal.Header style={{ marginBottom: "16px" }}>
                <Modal.Heading
                  style={{
                    fontFamily: SF_DISPLAY,
                    fontSize: "21px",
                    fontWeight: 600,
                    color: fg,
                    letterSpacing: "0.23px",
                    lineHeight: 1.19,
                  }}
                >{tx("home.newEvalTask")}</Modal.Heading>
              </Modal.Header>
              <Modal.Body style={{ padding: 0 }}>
                {ctLoadingData ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: "32px" }}>
                    <LoadingDots color="bg-current" />
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div>
                      <FieldLabel color={fg3}>{tx("home.taskName")}</FieldLabel>
                      <input
                        type="text"
                        value={ctName}
                        onChange={(e) => setCtName(e.target.value)}
                        placeholder={tx("home.taskNamePlaceholder")}
                        style={inputBaseStyle(fg, inputBg, inputBorder)}
                      />
                    </div>

                    <div>
                      <FieldLabel color={fg3}>{tx("home.model")}</FieldLabel>
                      <select
                        value={ctModelId === "" ? "" : String(ctModelId)}
                        onChange={(e) => {
                          const v = e.target.value;
                          setCtModelId(v === "" ? "" : Number(v));
                        }}
                        style={{ ...inputBaseStyle(fg, inputBg, inputBorder), appearance: "none" }}
                      >
                        {modelVendorGroups.map(([vendor, ms]) => (
                          <optgroup key={vendor} label={vendor}>
                            {ms.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.vendor} / {m.name}@{m.version}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    <div>
                      <FieldLabel color={fg3}>{tx("home.datasetsMulti")}</FieldLabel>
                      <div
                        style={{
                          maxHeight: "160px",
                          overflowY: "auto",
                          border: `1px solid ${inputBorder}`,
                          borderRadius: "10px",
                          padding: "8px 12px",
                          background: inputBg,
                          display: "flex",
                          flexDirection: "column",
                          gap: "6px",
                        }}
                      >
                        {ctDatasets.length === 0 && (
                          <span style={{ fontFamily: SF_TEXT, fontSize: "12px", color: fg4 }}>{tx("home.noDatasets")}</span>
                        )}
                        {ctDatasets.length > 0 && (
                          <label
                            className="flex items-center gap-2 cursor-pointer"
                            style={{
                              fontFamily: SF_TEXT,
                              fontSize: "13px",
                              fontWeight: 600,
                              color: fg,
                              minHeight: "28px",
                              borderBottom: `1px solid ${divider}`,
                              paddingBottom: "6px",
                              marginBottom: "2px",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={
                                ctDatasets.length > 0 &&
                                ctDatasets.every((d) => ctDatasetIds.includes(d.id))
                              }
                              ref={(el) => {
                                if (!el) return;
                                const all = ctDatasets.every((d) => ctDatasetIds.includes(d.id));
                                const some = ctDatasets.some((d) => ctDatasetIds.includes(d.id));
                                el.indeterminate = some && !all;
                              }}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setCtDatasetIds(ctDatasets.map((d) => d.id));
                                } else {
                                  setCtDatasetIds([]);
                                }
                              }}
                              style={{ accentColor: fg, width: "14px", height: "14px", cursor: "pointer" }}
                            />
                            <span>{tx("home.selectAllDatasets")}</span>
                            <span style={{ color: fg4, fontSize: "11px", fontWeight: 400 }}>
                              {ctDatasetIds.length}/{ctDatasets.length}
                            </span>
                          </label>
                        )}
                        {ctDatasets.map((d) => (
                          <label
                            key={d.id}
                            className="flex items-center gap-2 cursor-pointer"
                            style={{ fontFamily: SF_TEXT, fontSize: "13px", color: fg2, minHeight: "28px" }}
                          >
                            <input
                              type="checkbox"
                              checked={ctDatasetIds.includes(d.id)}
                              onChange={(e) => {
                                if (e.target.checked) setCtDatasetIds((prev) => [...prev, d.id]);
                                else setCtDatasetIds((prev) => prev.filter((x) => x !== d.id));
                              }}
                              style={{ accentColor: fg, width: "14px", height: "14px", cursor: "pointer" }}
                            />
                            <span>
                              {d.name}
                              <span style={{ color: fg4, fontSize: "11px", marginLeft: "6px" }}>
                                {d.domain} · {d.snapshot}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div>
                        <FieldLabel color={fg3}>{tx("home.inferenceBackend")}</FieldLabel>
                        <select
                          value={ctBackend}
                          onChange={(e) => setCtBackend(e.target.value)}
                          style={{ ...inputBaseStyle(fg, inputBg, inputBorder), appearance: "none" }}
                        >
                          {BACKENDS.map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <FieldLabel color={fg3}>temperature</FieldLabel>
                        <input
                          type="number"
                          value={ctTemperature}
                          onChange={(e) => setCtTemperature(e.target.value)}
                          min={0}
                          max={2}
                          step={0.1}
                          style={inputBaseStyle(fg, inputBg, inputBorder)}
                        />
                      </div>
                    </div>

                    <div>
                      <FieldLabel color={fg3}>maxTokens</FieldLabel>
                      <input
                        type="number"
                        value={ctMaxTokens}
                        onChange={(e) => setCtMaxTokens(e.target.value)}
                        min={1}
                        step={1}
                        style={inputBaseStyle(fg, inputBg, inputBorder)}
                      />
                    </div>

                    {ctError && (
                      <div
                        style={{
                          background: errorBg,
                          border: `1px solid ${errorBorder}`,
                          color: error,
                          fontFamily: SF_TEXT,
                          fontSize: "13px",
                          borderRadius: "10px",
                          padding: "10px 14px",
                        }}
                      >
                        {ctError}
                      </div>
                    )}
                  </div>
                )}
              </Modal.Body>
              <Modal.Footer style={{ marginTop: "20px", display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <PillButton fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={() => setShowCreateTask(false)}>{tx("home.cancel")}</PillButton>
                <PillButton primary fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={() => void submitCreateTask()} disabled={ctSubmitting || ctLoadingData}>
                  {ctSubmitting ? tx("home.creating") : tx("home.createTask")}
                </PillButton>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      { }
      <Modal state={{ isOpen: reportTaskUid !== null, setOpen: (open: boolean) => { if (!open) setReportTaskUid(null); }, open: () => {}, close: () => setReportTaskUid(null), toggle: () => setReportTaskUid((prev) => (prev ? null : prev)) }}>
        <Modal.Backdrop variant="blur">
          <Modal.Container placement="center" size="lg" scroll="inside" className="flex items-center justify-center">
            <Modal.Dialog
              className="!max-w-[min(960px,94vw)] w-[min(960px,94vw)]"
              style={{
                background: card,
                borderRadius: "12px",
                boxShadow: "none",
                border: `1px solid ${divider}`,
                padding: "16px 20px 18px",
                width: "min(960px, 94vw)",
                maxWidth: "min(960px, 94vw)",
              }}
            >
              <Modal.Header style={{ marginBottom: "16px" }}>
                <Modal.Heading
                  style={{
                    fontFamily: SF_DISPLAY,
                    fontSize: "21px",
                    fontWeight: 600,
                    color: fg,
                    letterSpacing: "0.23px",
                    lineHeight: 1.19,
                  }}
                >{tx("home.evalReport")}</Modal.Heading>
              </Modal.Header>
              <Modal.Body style={{ padding: 0 }}>
                {reportLoading ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: "32px" }}>
                    <LoadingDots color="bg-current" />
                  </div>
                ) : reportError ? (
                  <div style={{ fontFamily: SF_TEXT, fontSize: "13px", color: error }}>{reportError}</div>
                ) : report ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div>
                      <div style={{ fontFamily: SF_TEXT, fontSize: "13px", color: fg3, letterSpacing: "-0.1px", marginBottom: "4px" }}>
                        {report.taskName} · {report.modelName}
                      </div>
                      <div
                        style={{
                          fontFamily: SF_DISPLAY,
                          fontSize: "40px",
                          fontWeight: 600,
                          color: fg,
                          letterSpacing: "-1px",
                          lineHeight: 1,
                        }}
                      >
                        {report.compositeScore.toFixed(1)}
                      </div>
                      <div style={{ fontFamily: SF_TEXT, fontSize: "12px", color: fg3, marginTop: "4px" }}>{tx("home.compositeScore")}</div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                      {[
                        { label: tx("home.costPerTask"), value: formatCost(report.costPerTask) },
                        { label: tx("home.latencyP50"), value: report.latencyP50 == null ? "—" : `${report.latencyP50.toFixed(0)}ms` },
                        { label: tx("home.throughput"), value: report.throughput == null ? "—" : `${report.throughput.toFixed(1)}/s` },
                      ].map((s) => (
                        <div
                          key={s.label}
                          style={{
                            background: inputBg,
                            border: `1px solid ${divider}`,
                            borderRadius: "10px",
                            padding: "8px 10px",
                          }}
                        >
                          <div style={{ fontFamily: SF_MONO, fontSize: "13px", fontWeight: 600, color: fg, letterSpacing: "-0.2px" }}>
                            {s.value}
                          </div>
                          <div style={{ fontFamily: SF_TEXT, fontSize: "10px", color: fg3, marginTop: "2px" }}>{s.label}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <FieldLabel color={fg3}>{tx("home.domainScores")}</FieldLabel>
                      {report.domainScores.map((ds) => (
                        <DomainScoreBar key={ds.domain} ds={ds} fg={fg} fg2={fg2} fg3={fg3} divider={divider} />
                      ))}
                    </div>

                    {report.sampleResults?.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <FieldLabel color={fg3}>{tx("home.financeSamples")}</FieldLabel>
                        <SampleResultsScrollTable
                          samples={report.sampleResults}
                          divider={divider}
                          inputBg={inputBg}
                          fg={fg}
                          fg2={fg2}
                          fg3={fg3}
                          error={error}
                        />
                      </div>
                    )}

                    {report.fingerprint && (
                      <div>
                        <FieldLabel color={fg3}>{tx("home.fingerprint")}</FieldLabel>
                        <pre
                          style={{
                            fontFamily: SF_MONO,
                            fontSize: "11px",
                            color: fg2,
                            background: inputBg,
                            border: `1px solid ${divider}`,
                            borderRadius: "10px",
                            padding: "12px",
                            overflowX: "auto",
                            margin: 0,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                          }}
                        >
                          {(() => {
                            try {
                              return JSON.stringify(JSON.parse(report.fingerprint), null, 2);
                            } catch {
                              return report.fingerprint;
                            }
                          })()}
                        </pre>
                      </div>
                    )}
                  </div>
                ) : null}
              </Modal.Body>
              <Modal.Footer style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
                <PillButton fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={() => setReportTaskUid(null)}>{tx("common.close")}</PillButton>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      { }
      <Modal state={{ isOpen: showCompare, setOpen: setShowCompare, open: () => setShowCompare(true), close: () => setShowCompare(false), toggle: () => setShowCompare((prev) => !prev) }}>
        <Modal.Backdrop variant="blur">
          <Modal.Container placement="center" size="lg" scroll="inside" className="flex items-center justify-center">
            <Modal.Dialog
              style={{
                background: card,
                borderRadius: "12px",
                boxShadow: "none",
                border: `1px solid ${divider}`,
                padding: "16px 20px 18px",
              }}
            >
              <Modal.Header style={{ marginBottom: "16px" }}>
                <Modal.Heading
                  style={{
                    fontFamily: SF_DISPLAY,
                    fontSize: "21px",
                    fontWeight: 600,
                    color: fg,
                    letterSpacing: "0.23px",
                    lineHeight: 1.19,
                  }}
                >
                  {tx("home.compareTitle", { n: compareList.length })}
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body style={{ padding: 0 }}>
                { }
                <div className="flex flex-wrap gap-1.5" style={{ marginBottom: "16px" }}>
                  {compareList.map((p) => (
                    <span
                      key={p.modelId}
                      className="inline-flex items-center gap-1.5"
                      style={{
                        fontFamily: SF_TEXT,
                        fontSize: "12px",
                        color: fg,
                        background: badgeBg,
                        borderRadius: "980px",
                        padding: "4px 6px 4px 12px",
                        letterSpacing: "-0.1px",
                      }}
                    >
                      {p.name}
                      <button
                        onClick={() => removeFromCompare(p.modelId)}
                        aria-label={tx("home.removeNamed", { name: p.name })}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: fg3,
                          cursor: "pointer",
                          fontSize: "14px",
                          lineHeight: 1,
                          padding: "2px 6px",
                          borderRadius: "50%",
                          minWidth: "20px",
                          minHeight: "20px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                {compareNotice && (
                  <div style={{ fontFamily: SF_TEXT, fontSize: "12px", color: error, marginBottom: "12px" }}>{compareNotice}</div>
                )}

                {compareList.length >= 2 ? (
                  <div
                    style={{
                      background: inputBg,
                      border: `1px solid ${divider}`,
                      borderRadius: "12px",
                      padding: "0",
                    }}
                  >
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: SF_TEXT, fontSize: "14px" }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left", color: fg3, fontWeight: 600, padding: "8px 12px 8px 0", borderBottom: `1px solid ${divider}`, fontSize: "12px", letterSpacing: "0.02em", whiteSpace: "nowrap" }}>{tx("home.metric")}</th>
                          {compareList.map((p) => (
                            <th
                              key={p.modelId}
                              style={{ textAlign: "right", color: fg, fontWeight: 600, padding: "8px 0 8px 12px", borderBottom: `1px solid ${divider}`, letterSpacing: "-0.2px", maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                            >
                              {p.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {compareDomains.map((domain) => (
                          <tr key={domain} data-row>
                            <td style={{ color: fg2, padding: "8px 12px 8px 0", borderBottom: `1px solid ${divider}`, letterSpacing: "-0.1px", whiteSpace: "nowrap" }}>
                              {domain}
                            </td>
                            {compareList.map((p) => {
                              const d = p.domainScores.find((x) => x.domain === domain);
                              return (
                                <td key={p.modelId} style={{ textAlign: "right", color: fg, fontFamily: SF_MONO, fontSize: "12px", padding: "8px 0 8px 12px", borderBottom: `1px solid ${divider}` }}>
                                  {d ? d.score.toFixed(1) : "—"}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                        <tr data-row>
                          <td style={{ color: fg, fontWeight: 600, padding: "8px 12px 8px 0", borderBottom: `1px solid ${divider}`, letterSpacing: "-0.1px" }}>{tx("home.compositeScore")}</td>
                          {compareList.map((p) => (
                            <td key={p.modelId} style={{ textAlign: "right", color: fg, fontWeight: 600, fontFamily: SF_MONO, fontSize: "12px", padding: "8px 0 8px 12px", borderBottom: `1px solid ${divider}` }}>
                              {p.compositeScore.toFixed(1)}
                            </td>
                          ))}
                        </tr>
                        <tr data-row>
                          <td style={{ color: fg2, padding: "8px 12px 0 0", letterSpacing: "-0.1px" }}>{tx("home.costPerTask")}</td>
                          {compareList.map((p) => (
                            <td key={p.modelId} style={{ textAlign: "right", color: fg, fontFamily: SF_MONO, fontSize: "12px", padding: "8px 0 0 12px" }}>
                              {formatCost(p.costPerTask)}
                            </td>
                          ))}
                        </tr>
                        <tr data-row>
                          <td style={{ color: fg2, padding: "8px 12px 0 0", letterSpacing: "-0.1px" }}>{tx("home.colInputPrice")}</td>
                          {compareList.map((p) => (
                            <td key={p.modelId} style={{ textAlign: "right", color: fg, fontFamily: SF_MONO, fontSize: "12px", padding: "8px 0 0 12px" }}>
                              {formatPrice(p.inputPricePer1m, tx("home.pendingPrice"))}
                            </td>
                          ))}
                        </tr>
                        <tr data-row>
                          <td style={{ color: fg2, padding: "8px 12px 0 0", letterSpacing: "-0.1px" }}>{tx("home.colOutputPrice")}</td>
                          {compareList.map((p) => (
                            <td key={p.modelId} style={{ textAlign: "right", color: fg, fontFamily: SF_MONO, fontSize: "12px", padding: "8px 0 0 12px" }}>
                              {formatPrice(p.outputPricePer1m, tx("home.pendingPrice"))}
                            </td>
                          ))}
                        </tr>
                        <tr data-row>
                          <td style={{ color: fg2, padding: "8px 12px 0 0", letterSpacing: "-0.1px" }}>{tx("home.valueForMoneyRank")}</td>
                          {compareList.map((p) => (
                            <td key={p.modelId} style={{ textAlign: "right", color: fg, fontFamily: SF_MONO, fontSize: "12px", padding: "8px 0 0 12px" }}>
                              #{p.valueRank}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontFamily: SF_TEXT, fontSize: "14px", color: fg3, textAlign: "center", padding: "32px 0", letterSpacing: "-0.15px" }}>{tx("home.compareNeedTwo")}</div>
                )}
              </Modal.Body>
              <Modal.Footer style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
                <PillButton fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={() => setShowCompare(false)}>{tx("common.close")}</PillButton>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      { }
      <Modal state={{ isOpen: showRegisterModel, setOpen: (open: boolean) => { if (open) setShowRegisterModel(true); else closeModelForm(); }, open: () => setShowRegisterModel(true), close: closeModelForm, toggle: () => { if (showRegisterModel) closeModelForm(); else setShowRegisterModel(true); } }}>
        <Modal.Backdrop variant="blur">
          <Modal.Container placement="center" size="lg" scroll="inside" className="flex items-center justify-center">
            <Modal.Dialog
              style={{
                background: card,
                borderRadius: "12px",
                boxShadow: "none",
                border: `1px solid ${divider}`,
                padding: "16px 20px 18px",
                width: "min(640px, 94vw)",
              }}
            >
              <Modal.Header style={{ marginBottom: "16px" }}>
                <Modal.Heading
                  style={{
                    fontFamily: SF_DISPLAY,
                    fontSize: "21px",
                    fontWeight: 600,
                    color: fg,
                    letterSpacing: "0.23px",
                    lineHeight: 1.19,
                  }}
                >{isEditingModel ? tx("home.editModel") : tx("home.registerModel")}</Modal.Heading>
              </Modal.Header>
              <Modal.Body style={{ padding: 0 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                      <FieldLabel color={fg3}>{tx("home.nameRequired")}</FieldLabel>
                      <input
                        type="text"
                        value={rmName}
                        onChange={(e) => setRmName(e.target.value)}
                        placeholder="如 Qwen3-8B"
                        style={inputBaseStyle(fg, inputBg, inputBorder)}
                      />
                    </div>
                    <div>
                      <FieldLabel color={fg3}>{tx("home.vendorRequired")}</FieldLabel>
                      <input
                        type="text"
                        value={rmVendor}
                        onChange={(e) => setRmVendor(e.target.value)}
                        placeholder="如 Alibaba"
                        style={inputBaseStyle(fg, inputBg, inputBorder)}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                      <FieldLabel color={fg3}>{tx("home.seriesRequired")}</FieldLabel>
                      <input
                        type="text"
                        value={rmSeries}
                        onChange={(e) => setRmSeries(e.target.value)}
                        placeholder="如 Qwen3"
                        style={inputBaseStyle(fg, inputBg, inputBorder)}
                      />
                    </div>
                    <div>
                      <FieldLabel color={fg3}>{tx("home.versionRequired")}</FieldLabel>
                      <input
                        type="text"
                        value={rmVersion}
                        onChange={(e) => setRmVersion(e.target.value)}
                        placeholder="如 1.0"
                        style={inputBaseStyle(fg, inputBg, inputBorder)}
                      />
                    </div>
                  </div>

                  <div>
                    <FieldLabel color={fg3}>{tx("home.baseUrlRequired")}</FieldLabel>
                    <input
                      type="url"
                      value={rmBaseUrl}
                      onChange={(e) => setRmBaseUrl(e.target.value)}
                      placeholder="https://apihk.chinarouter.net/v1"
                      style={inputBaseStyle(fg, inputBg, inputBorder)}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                      <FieldLabel color={fg3}>
                        {isEditingModel ? tx("home.apiKeyOptional") : tx("home.apiKeyRequired")}
                      </FieldLabel>
                      <input
                        type="password"
                        value={rmApiKey}
                        onChange={(e) => setRmApiKey(e.target.value)}
                        placeholder={isEditingModel ? (rmApiKeyHint || tx("home.apiKeyKeepHint")) : "sk-..."}
                        autoComplete="off"
                        style={inputBaseStyle(fg, inputBg, inputBorder)}
                      />
                      {isEditingModel && (
                        <div style={{ fontFamily: SF_TEXT, fontSize: "11px", color: fg4, marginTop: "6px" }}>
                          {tx("home.apiKeyKeepHint")}
                          {rmApiKeyHint ? ` · ${rmApiKeyHint}` : ""}
                        </div>
                      )}
                    </div>
                    <div>
                      <FieldLabel color={fg3}>{tx("home.modelNameRequired")}</FieldLabel>
                      <input
                        type="text"
                        value={rmModelName}
                        onChange={(e) => setRmModelName(e.target.value)}
                        placeholder="如 qwen3.8-flash"
                        style={inputBaseStyle(fg, inputBg, inputBorder)}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                      <FieldLabel color={fg3}>{tx("home.inputPriceRequired")}</FieldLabel>
                      <input
                        type="number"
                        value={rmInputPrice}
                        onChange={(e) => setRmInputPrice(e.target.value)}
                        placeholder="如 0.15"
                        min={0}
                        step="any"
                        style={inputBaseStyle(fg, inputBg, inputBorder)}
                      />
                    </div>
                    <div>
                      <FieldLabel color={fg3}>{tx("home.outputPriceRequired")}</FieldLabel>
                      <input
                        type="number"
                        value={rmOutputPrice}
                        onChange={(e) => setRmOutputPrice(e.target.value)}
                        placeholder="如 0.60"
                        min={0}
                        step="any"
                        style={inputBaseStyle(fg, inputBg, inputBorder)}
                      />
                    </div>
                  </div>

                  {rmError && (
                    <div
                      style={{
                        background: errorBg,
                        border: `1px solid ${errorBorder}`,
                        color: error,
                        fontFamily: SF_TEXT,
                        fontSize: "13px",
                        borderRadius: "10px",
                        padding: "10px 14px",
                      }}
                    >
                      {rmError}
                    </div>
                  )}
                </div>
              </Modal.Body>
              <Modal.Footer style={{ marginTop: "20px", display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <PillButton fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={closeModelForm}>{tx("home.cancel")}</PillButton>
                <PillButton primary fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={() => void submitRegisterModel()} disabled={rmSubmitting}>
                  {rmSubmitting
                    ? (isEditingModel ? tx("home.saving") : tx("home.registering"))
                    : (isEditingModel ? tx("home.saveChanges") : tx("home.register"))}
                </PillButton>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
