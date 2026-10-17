"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/context/ThemeContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LoadingDots } from "@/components/ui/LoadingDots";
import { Modal } from "@heroui/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  evalGraphqlApi,
  userGraphqlApi,
  type DatasetItem,
  type DomainScore,
  type EvalTaskItem,
  type ModelItem,
  type ScoreGraphFilterInput,
  type ScorePoint,
  type TaskReport,
} from "@/api/graphql";
import { getTokens, SF_DISPLAY, SF_TEXT, SF_MONO } from "@/utils/tokens";


const ease = [0.25, 0.4, 0.25, 1] as [number, number, number, number];
const ERROR_COLOR = "#dc2626";

const TABS = [
  { key: "graph", label: "评分图谱" },
  { key: "tasks", label: "评测任务" },
  { key: "models", label: "模型注册" },
  { key: "datasets", label: "数据集" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

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

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}


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
  shadow: string;
  border?: string;
  style?: React.CSSProperties;
  noPadding?: boolean;
}) => (
  <div
    className={`rounded-2xl overflow-hidden ${className}`}
    style={{ background: bg, boxShadow: shadow, border, ...style }}
  >
    {noPadding ? children : <div style={{ padding: "28px" }}>{children}</div>}
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
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="transition-opacity duration-200 hover:opacity-75 disabled:opacity-40 disabled:cursor-not-allowed"
    style={{
      fontFamily: SF_TEXT,
      fontSize: small ? "13px" : "15px",
      fontWeight: 500,
      letterSpacing: "-0.2px",
      background: primary ? accent : "transparent",
      color: primary ? accentFg : fg,
      border: primary ? "none" : `1px solid ${divider}`,
      borderRadius: "980px",
      padding: small ? "6px 16px" : "9px 22px",
      cursor: disabled ? "not-allowed" : "pointer",
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </button>
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
      fontSize: "11px",
      fontWeight: 600,
      letterSpacing: "0.04em",
      color,
      background: bg,
      border: border ? `1px solid ${border}` : "none",
      borderRadius: "980px",
      padding: "3px 10px",
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </span>
);

const FieldLabel = ({ children, color }: { children: React.ReactNode; color: string }) => (
  <div
    style={{
      fontFamily: SF_TEXT,
      fontSize: "11px",
      fontWeight: 600,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color,
      marginBottom: "6px",
    }}
  >
    {children}
  </div>
);

const inputBaseStyle = (
  fg: string,
  inputBg: string,
  inputBorder: string,
): React.CSSProperties => ({
  fontFamily: SF_TEXT,
  fontSize: "14px",
  letterSpacing: "-0.15px",
  color: fg,
  backgroundColor: inputBg,
  border: `1px solid ${inputBorder}`,
  borderRadius: "10px",
  padding: "9px 12px",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
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
      <span style={{ fontFamily: SF_TEXT, fontSize: "13px", color: fg2, letterSpacing: "-0.1px" }}>
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
  const isDark = theme === "dark";

  const t = getTokens(isDark);
  const { bg, fg, fg2, fg3, fg4, card, inputBg, inputBorder, divider, shadow, navBg, accent, accentFg, badgeBg, error, errorBg, errorBorder } = t;

  const cardHighlight = isDark ? "inset 0 1px 0 rgba(255,255,255,0.07)" : "inset 0 1px 0 rgba(255,255,255,0.9)";
  const cardShadow = `${shadow}, ${cardHighlight}`;

  const [activeTab, setActiveTab] = useState<TabKey>("graph");
  const [userEmail, setUserEmail] = useState("");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);

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
    const check = () => setIsNarrow(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const handleLogout = useCallback(async () => {
    setShowLogoutConfirm(false);
    try {
      await userGraphqlApi.logout();
    } catch {}
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/f/login");
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
      setGraphError(e.message || "加载失败");
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

    const costs = points.map((p) => Math.max(p.costPerTask, 1e-6));
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
        setCompareNotice("最多同时对比 4 个模型");
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
  const [actionMessage, setActionMessage] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadTasks = useCallback(async (status?: string) => {
    setTasksLoading(true);
    setTasksError("");
    try {
      const r = await evalGraphqlApi.listTasks(status || undefined);
      setTasks(r.tasks);
    } catch (e: any) {
      setTasksError(e.message || "加载失败");
    } finally {
      setTasksLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "tasks") {
      void loadTasks(taskStatusFilter || undefined);
    }
  }, [activeTab, taskStatusFilter, loadTasks]);

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
  const [ctModelId, setCtModelId] = useState("");
  const [ctDatasetIds, setCtDatasetIds] = useState<string[]>([]);
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
      const [m, d] = await Promise.all([evalGraphqlApi.listModels(), evalGraphqlApi.listDatasets()]);
      setCtModels(m.models);
      setCtDatasets(d.datasets);
      if (m.models.length > 0) setCtModelId(m.models[0].id);
    } catch (e: any) {
      setCtError(e.message || "加载模型/数据集失败");
    } finally {
      setCtLoadingData(false);
    }
  }, []);

  const submitCreateTask = useCallback(async () => {
    setCtError("");
    if (!ctName.trim()) {
      setCtError("请输入任务名");
      return;
    }
    if (!ctModelId) {
      setCtError("请选择模型");
      return;
    }
    if (ctDatasetIds.length === 0) {
      setCtError("请至少选择一个数据集");
      return;
    }
    const temp = parseFloat(ctTemperature);
    const mt = parseInt(ctMaxTokens, 10);
    if (isNaN(temp) || temp < 0 || temp > 2) {
      setCtError("temperature 需在 0-2 之间");
      return;
    }
    if (isNaN(mt) || mt <= 0) {
      setCtError("maxTokens 需为正整数");
      return;
    }
    setCtSubmitting(true);
    try {
      const r = await evalGraphqlApi.createTask({
        name: ctName.trim(),
        modelId: ctModelId,
        datasetIds: ctDatasetIds,
        backend: ctBackend,
        temperature: temp,
        maxTokens: mt,
      });
      if (!r.createTask.success) {
        setCtError(r.createTask.message || "创建失败");
        return;
      }
      setShowCreateTask(false);
      setActionMessage("任务创建成功");
      setTimeout(() => setActionMessage(""), 4000);
      void loadTasks(taskStatusFilter || undefined);
    } catch (e: any) {
      setCtError(e.message || "创建失败");
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
      setReportError(e.message || "加载报告失败");
    } finally {
      setReportLoading(false);
    }
  }, []);

  const taskAction = useCallback(
    async (taskUid: string, kind: "pause" | "resume") => {
      setActionMessage("");
      try {
        if (kind === "pause") {
          const r = await evalGraphqlApi.pauseTask(taskUid);
          setActionMessage(r.pauseTask?.message || "已暂停");
        } else {
          const r = await evalGraphqlApi.resumeTask(taskUid);
          setActionMessage(r.resumeTask?.message || "已续跑");
        }
        void loadTasks(taskStatusFilter || undefined);
      } catch (e: any) {
        setActionMessage(e.message || "操作失败");
      }
      setTimeout(() => setActionMessage(""), 4000);
    },
    [loadTasks, taskStatusFilter],
  );

  const [models, setModels] = useState<ModelItem[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");
  const [modelsNotice, setModelsNotice] = useState("");

  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    setModelsError("");
    try {
      const r = await evalGraphqlApi.listModels();
      setModels(r.models);
    } catch (e: any) {
      setModelsError(e.message || "加载失败");
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "models") {
      void loadModels();
    }
  }, [activeTab, loadModels]);

  const [showRegisterModel, setShowRegisterModel] = useState(false);
  const [rmName, setRmName] = useState("");
  const [rmVendor, setRmVendor] = useState("");
  const [rmSeries, setRmSeries] = useState("");
  const [rmVersion, setRmVersion] = useState("");
  const [rmAccessType, setRmAccessType] = useState("api");
  const [rmBackend, setRmBackend] = useState("vllm");
  const [rmParamsB, setRmParamsB] = useState("");
  const [rmContextLength, setRmContextLength] = useState("");
  const [rmSubmitting, setRmSubmitting] = useState(false);
  const [rmError, setRmError] = useState("");

  const openRegisterModel = useCallback(() => {
    setShowRegisterModel(true);
    setRmError("");
    setRmName("");
    setRmVendor("");
    setRmSeries("");
    setRmVersion("");
    setRmAccessType("api");
    setRmBackend("vllm");
    setRmParamsB("");
    setRmContextLength("");
  }, []);

  const submitRegisterModel = useCallback(async () => {
    setRmError("");
    if (!rmName.trim() || !rmVendor.trim() || !rmSeries.trim() || !rmVersion.trim()) {
      setRmError("请填写名称、厂商、系列、版本");
      return;
    }
    let paramsB: number | undefined;
    let contextLength: number | undefined;
    if (rmParamsB.trim()) {
      const n = parseFloat(rmParamsB);
      if (isNaN(n) || n < 0) {
        setRmError("参数量需为非负数字");
        return;
      }
      paramsB = n;
    }
    if (rmContextLength.trim()) {
      const n = parseInt(rmContextLength, 10);
      if (isNaN(n) || n < 0) {
        setRmError("上下文长度需为非负整数");
        return;
      }
      contextLength = n;
    }
    setRmSubmitting(true);
    try {
      const r = await evalGraphqlApi.registerModel({
        name: rmName.trim(),
        vendor: rmVendor.trim(),
        series: rmSeries.trim(),
        version: rmVersion.trim(),
        accessType: rmAccessType,
        backend: rmBackend,
        paramsB: paramsB ?? null,
        contextLength: contextLength ?? null,
      });
      if (!r.registerModel.success) {
        setRmError(r.registerModel.message || "注册失败");
        return;
      }
      setShowRegisterModel(false);
      setModelsNotice("模型注册成功");
      setTimeout(() => setModelsNotice(""), 4000);
      void loadModels();
    } catch (e: any) {
      setRmError(e.message || "注册失败");
    } finally {
      setRmSubmitting(false);
    }
  }, [rmName, rmVendor, rmSeries, rmVersion, rmAccessType, rmBackend, rmParamsB, rmContextLength, loadModels]);

  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(false);
  const [datasetsError, setDatasetsError] = useState("");

  const loadDatasets = useCallback(async () => {
    setDatasetsLoading(true);
    setDatasetsError("");
    try {
      const r = await evalGraphqlApi.listDatasets();
      setDatasets(r.datasets);
    } catch (e: any) {
      setDatasetsError(e.message || "加载失败");
    } finally {
      setDatasetsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "datasets") {
      void loadDatasets();
    }
  }, [activeTab, loadDatasets]);


  const filterPanel = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      { }
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column", gap: "16px" }}>
        <div>
          <FieldLabel color={fg3}>厂商</FieldLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {graphData.vendors.length === 0 && (
              <span style={{ fontFamily: SF_TEXT, fontSize: "12px", color: fg4 }}>加载中…</span>
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
          <FieldLabel color={fg3}>接入方式</FieldLabel>
          <select
            value={filterAccessType}
            onChange={(e) => setFilterAccessType(e.target.value)}
            style={{ ...inputBaseStyle(fg, inputBg, inputBorder), appearance: "none" }}
          >
            <option value="">全部</option>
            {ACCESS_TYPES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div>
          <FieldLabel color={fg3}>推理后端</FieldLabel>
          <select
            value={filterBackend}
            onChange={(e) => setFilterBackend(e.target.value)}
            style={{ ...inputBaseStyle(fg, inputBg, inputBorder), appearance: "none" }}
          >
            <option value="">全部</option>
            {BACKENDS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        <div>
          <FieldLabel color={fg3}>最低评分</FieldLabel>
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
          <FieldLabel color={fg3}>最高成本 (USD)</FieldLabel>
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
          gap: "8px",
          paddingTop: "12px",
          marginTop: "12px",
          borderTop: `1px solid ${divider}`,
          flexShrink: 0,
        }}
      >
        <PillButton primary small fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={applyFilter} disabled={graphLoading}>
          应用筛选
        </PillButton>
        <PillButton small fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={resetFilter} disabled={graphLoading}>
          重置
        </PillButton>
      </div>
    </div>
  );


  const detailPanel = (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {!selectedPoint ? (
        <div
          style={{
            fontFamily: SF_TEXT,
            fontSize: "14px",
            color: fg3,
            textAlign: "center",
            padding: "40px 8px",
            letterSpacing: "-0.15px",
          }}
        >
          点击气泡查看模型详情
        </div>
      ) : (
        <>
          <div>
            <div
              style={{
                fontFamily: SF_DISPLAY,
                fontSize: "22px",
                fontWeight: 600,
                color: fg,
                letterSpacing: "-0.44px",
                lineHeight: 1.15,
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
                fontSize: "40px",
                fontWeight: 600,
                color: fg,
                letterSpacing: "-0.8px",
                lineHeight: 1,
              }}
            >
              {selectedPoint.compositeScore.toFixed(1)}
            </div>
            <div style={{ fontFamily: SF_TEXT, fontSize: "12px", color: fg3, marginTop: "4px", letterSpacing: "-0.1px" }}>
              综合评分
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
            {[
              { label: "成本/任务", value: formatCost(selectedPoint.costPerTask) },
              { label: "P50 时延", value: `${selectedPoint.latencyP50.toFixed(0)}ms` },
              { label: "吞吐", value: `${selectedPoint.throughput.toFixed(1)}/s` },
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
            <FieldLabel color={fg3}>能力域得分</FieldLabel>
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
            {compareList.some((x) => x.modelId === selectedPoint.modelId) ? "已加入对比" : "加入对比"}
          </PillButton>
        </>
      )}

      { }
      {compareList.length > 0 && (
        <div style={{ borderTop: `1px solid ${divider}`, paddingTop: "16px" }}>
          <FieldLabel color={fg3}>对比清单 ({compareList.length}/4)</FieldLabel>
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
                  aria-label={`移除 ${p.name}`}
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
            查看对比
          </PillButton>
          {compareList.length < 2 && (
            <div style={{ fontFamily: SF_TEXT, fontSize: "12px", color: fg4, marginTop: "8px", letterSpacing: "-0.1px" }}>
              至少选择 2 个模型后可查看对比
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
              <span style={{ fontFamily: SF_TEXT, fontSize: "11px", color: fg2, letterSpacing: "-0.1px" }}>Pareto 前沿</span>
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
            alignItems: "center",
            justifyContent: "center",
            fontFamily: SF_TEXT,
            fontSize: "15px",
            color: fg3,
            letterSpacing: "-0.15px",
          }}
        >
          暂无评测数据，请先去创建评测任务
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
            每任务推理成本（USD，对数刻度）
          </text>
          <text
            x={14}
            y={geom.MT + geom.plotH / 2}
            textAnchor="middle"
            transform={`rotate(-90, 14, ${geom.MT + geom.plotH / 2})`}
            style={{ fontFamily: SF_TEXT, fontSize: "11px", fill: fg3, letterSpacing: "0.02em" }}
          >
            综合评分
          </text>

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
                  Pareto 前沿 · 同价位最优
                </text>
                { }
                <text
                  x={right - 6}
                  y={bottom - 8}
                  textAnchor="end"
                  style={{ fontFamily: SF_TEXT, fontSize: "10px", fill: PARETO_COLOR, opacity: 0.45, letterSpacing: "0.02em" }}
                >
                  阴影区 = 被支配（存在更便宜且更优的选择）
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
              ◆ Pareto 前沿点 · 同价位最优
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "2px 10px", fontFamily: SF_MONO, fontSize: "11px", color: fg2 }}>
            <span style={{ color: fg3 }}>评分</span>
            <span>{hoverPoint.point.compositeScore.toFixed(1)}</span>
            <span style={{ color: fg3 }}>成本</span>
            <span>{formatCost(hoverPoint.point.costPerTask)}</span>
            <span style={{ color: fg3 }}>P50</span>
            <span>{hoverPoint.point.latencyP50.toFixed(0)}ms</span>
            <span style={{ color: fg3 }}>吞吐</span>
            <span>{hoverPoint.point.throughput.toFixed(1)}/s</span>
            <span style={{ color: fg3 }}>性价比</span>
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
      <div className="flex items-center justify-between flex-wrap gap-3" style={{ marginBottom: "20px" }}>
        <div className="flex items-center gap-3">
          <select
            value={taskStatusFilter}
            onChange={(e) => setTaskStatusFilter(e.target.value)}
            style={{ ...inputBaseStyle(fg, inputBg, inputBorder), width: "auto", minWidth: "130px", appearance: "none" }}
            aria-label="状态筛选"
          >
            <option value="">全部状态</option>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {actionMessage && (
            <span style={{ fontFamily: SF_TEXT, fontSize: "13px", color: fg2, letterSpacing: "-0.1px" }}>{actionMessage}</span>
          )}
        </div>
        <PillButton primary fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={() => void openCreateTask()}>
          新建评测任务
        </PillButton>
      </div>

      { }
      {tasksError && (
        <div style={{ fontFamily: SF_TEXT, fontSize: "13px", color: error, marginBottom: "12px" }}>{tasksError}</div>
      )}
      {tasks.length === 0 && !tasksLoading ? (
        <div style={{ fontFamily: SF_TEXT, fontSize: "14px", color: fg3, textAlign: "center", padding: "48px 0", letterSpacing: "-0.15px" }}>
          暂无评测任务
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: SF_TEXT, fontSize: "13px" }}>
            <thead>
              <tr>
                {["任务标识", "名称", "模型", "后端", "状态", "进度", "操作"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      color: fg3,
                      fontWeight: 600,
                      padding: "8px 12px 8px 0",
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
                  <td style={{ padding: "10px 12px 10px 0", borderBottom: `1px solid ${divider}`, fontFamily: SF_MONO, fontSize: "11px", color: fg3, whiteSpace: "nowrap" }}>
                    {tk.taskUid.slice(0, 8)}
                  </td>
                  <td style={{ padding: "10px 12px 10px 0", borderBottom: `1px solid ${divider}`, color: fg, fontWeight: 500, letterSpacing: "-0.1px", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {tk.name}
                  </td>
                  <td style={{ padding: "10px 12px 10px 0", borderBottom: `1px solid ${divider}`, color: fg2, letterSpacing: "-0.1px", whiteSpace: "nowrap" }}>
                    {tk.modelName}
                    <span style={{ color: fg4, marginLeft: "6px", fontSize: "11px" }}>{tk.modelVendor}</span>
                  </td>
                  <td style={{ padding: "10px 12px 10px 0", borderBottom: `1px solid ${divider}`, color: fg2, fontFamily: SF_MONO, fontSize: "12px", whiteSpace: "nowrap" }}>
                    {tk.backend}
                  </td>
                  <td style={{ padding: "10px 12px 10px 0", borderBottom: `1px solid ${divider}`, whiteSpace: "nowrap" }}>
                    {statusBadge(tk.status)}
                  </td>
                  <td style={{ padding: "10px 12px 10px 0", borderBottom: `1px solid ${divider}`, minWidth: "90px" }}>
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
                    {tk.status === "Running" && (
                      <PillButton small fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={() => void taskAction(tk.taskUid, "pause")}>
                        暂停
                      </PillButton>
                    )}
                    {tk.status === "Paused" && (
                      <PillButton small fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={() => void taskAction(tk.taskUid, "resume")}>
                        续跑
                      </PillButton>
                    )}
                    {tk.status === "Failed" && (
                      <PillButton small fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={() => void taskAction(tk.taskUid, "resume")}>
                        重跑
                      </PillButton>
                    )}
                    {tk.status === "Done" && (
                      <PillButton small fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={() => void openReport(tk.taskUid)}>
                        报告
                      </PillButton>
                    )}
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
    </div>
  );


  const modelsPanel = (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3" style={{ marginBottom: "20px" }}>
        {modelsNotice ? (
          <span style={{ fontFamily: SF_TEXT, fontSize: "13px", color: fg2, letterSpacing: "-0.1px" }}>{modelsNotice}</span>
        ) : (
          <span />
        )}
        <PillButton primary fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={openRegisterModel}>
          注册模型
        </PillButton>
      </div>

      {modelsError && (
        <div style={{ fontFamily: SF_TEXT, fontSize: "13px", color: error, marginBottom: "12px" }}>{modelsError}</div>
      )}
      {models.length === 0 && !modelsLoading ? (
        <div style={{ fontFamily: SF_TEXT, fontSize: "14px", color: fg3, textAlign: "center", padding: "48px 0", letterSpacing: "-0.15px" }}>
          暂无模型，点击右上角注册
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: SF_TEXT, fontSize: "13px" }}>
            <thead>
              <tr>
                {["名称", "厂商", "系列", "版本", "接入方式", "后端", "参数量", "上下文"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      color: fg3,
                      fontWeight: 600,
                      padding: "8px 12px 8px 0",
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
                  <td style={{ padding: "10px 12px 10px 0", borderBottom: `1px solid ${divider}`, color: fg, fontWeight: 500, letterSpacing: "-0.1px", whiteSpace: "nowrap" }}>
                    {m.name}
                  </td>
                  <td style={{ padding: "10px 12px 10px 0", borderBottom: `1px solid ${divider}`, color: fg2, whiteSpace: "nowrap" }}>
                    {m.vendor}
                  </td>
                  <td style={{ padding: "10px 12px 10px 0", borderBottom: `1px solid ${divider}`, color: fg2, whiteSpace: "nowrap" }}>
                    {m.series}
                  </td>
                  <td style={{ padding: "10px 12px 10px 0", borderBottom: `1px solid ${divider}`, color: fg2, fontFamily: SF_MONO, fontSize: "12px", whiteSpace: "nowrap" }}>
                    {m.version}
                  </td>
                  <td style={{ padding: "10px 12px 10px 0", borderBottom: `1px solid ${divider}`, whiteSpace: "nowrap" }}>
                    <Badge bg={badgeBg} color={fg2}>
                      {m.accessType}
                    </Badge>
                  </td>
                  <td style={{ padding: "10px 12px 10px 0", borderBottom: `1px solid ${divider}`, color: fg2, fontFamily: SF_MONO, fontSize: "12px", whiteSpace: "nowrap" }}>
                    {m.backend}
                  </td>
                  <td style={{ padding: "10px 12px 10px 0", borderBottom: `1px solid ${divider}`, color: fg2, fontFamily: SF_MONO, fontSize: "12px", whiteSpace: "nowrap" }}>
                    {m.paramsB != null ? `${m.paramsB}B` : "—"}
                  </td>
                  <td style={{ padding: "10px 0", borderBottom: `1px solid ${divider}`, color: fg2, fontFamily: SF_MONO, fontSize: "12px", whiteSpace: "nowrap" }}>
                    {m.contextLength != null ? formatCount(m.contextLength) : "—"}
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
    </div>
  );


  const datasetsPanel = (
    <div>
      {datasetsError && (
        <div style={{ fontFamily: SF_TEXT, fontSize: "13px", color: error, marginBottom: "12px" }}>{datasetsError}</div>
      )}
      {datasets.length === 0 && !datasetsLoading ? (
        <div style={{ fontFamily: SF_TEXT, fontSize: "14px", color: fg3, textAlign: "center", padding: "48px 0", letterSpacing: "-0.15px" }}>
          暂无数据集
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr",
            gap: "16px",
          }}
        >
          {datasets.map((d) => (
            <Card key={d.id} className="lift-card" bg={card} shadow={cardShadow} border={`1px solid ${divider}`} noPadding>
              <div style={{ padding: "20px 24px" }}>
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
                <div style={{ fontFamily: SF_TEXT, fontSize: "13px", color: fg2, letterSpacing: "-0.1px", marginBottom: "10px", lineHeight: 1.5 }}>
                  {d.description}
                </div>
                <div style={{ fontFamily: SF_TEXT, fontSize: "12px", color: fg3, letterSpacing: "-0.1px" }}>
                  {formatCount(d.sampleCount)} 样本
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
    <div className="h-screen flex flex-col" style={{ background: bg }}>
      { }
      <nav
        className="flex items-center justify-between shrink-0 z-50"
        style={{
          height: "56px",
          padding: "0 20px",
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
            <span style={{ fontFamily: SF_DISPLAY, fontSize: "16px", fontWeight: 600, color: fg, letterSpacing: "-0.35px", whiteSpace: "nowrap" }}>
              评测平台 · id_x_009
            </span>
          </div>

          { }
          <div className="flex items-center gap-1" style={{ marginLeft: "12px" }}>
            {TABS.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className="transition-colors duration-200"
                  style={{
                    position: "relative",
                    fontFamily: SF_TEXT,
                    fontSize: "14px",
                    fontWeight: active ? 600 : 400,
                    letterSpacing: "-0.15px",
                    color: active ? fg : fg3,
                    background: "transparent",
                    border: "none",
                    borderRadius: "980px",
                    padding: "6px 14px",
                    cursor: "pointer",
                    minHeight: "44px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-tab-pill"
                      transition={{ type: "spring", stiffness: 500, damping: 38 }}
                      style={{
                        position: "absolute",
                        inset: "4px 0",
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
                fontSize: "13px",
                color: fg3,
                letterSpacing: "-0.1px",
                maxWidth: "180px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {userEmail}
            </span>
          )}
          <ThemeToggle />
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className={`p-3 rounded-full transition-colors duration-200 ${isDark ? "hover:bg-[rgba(255,255,255,0.08)]" : "hover:bg-[rgba(0,0,0,0.05)]"}`}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: fg2,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="登出"
            title="登出"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
          </button>
        </div>
      </nav>

      { }
      <main className="flex-1 min-h-0 overflow-hidden">
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
                <div style={{ padding: "12px" }}>
                  {isNarrow && (
                    <div style={{ marginBottom: "12px" }}>
                      <PillButton small fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={() => setShowFilterPanel((v) => !v)}>
                        {showFilterPanel ? "收起筛选" : "展开筛选"}
                      </PillButton>
                    </div>
                  )}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isNarrow ? "1fr" : "220px 1fr 300px",
                      gap: "16px",
                      alignItems: isNarrow ? "start" : "stretch",
                      height: isNarrow ? undefined : "calc(100dvh - 80px)",
                    }}
                  >
                    { }
                    {(!isNarrow || showFilterPanel) && (
                      <Card bg={card} shadow={cardShadow} border={`1px solid ${divider}`} noPadding style={{ height: isNarrow ? undefined : "100%", minHeight: 0 }}>
                        <div style={{ padding: "20px", height: isNarrow ? undefined : "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>{filterPanel}</div>
                      </Card>
                    )}

                    { }
                    <Card bg={card} shadow={cardShadow} border={`1px solid ${divider}`} noPadding style={{ height: isNarrow ? undefined : "100%", minHeight: isNarrow ? "480px" : 0 }}>
                      <div style={{ padding: "12px", height: isNarrow ? undefined : "100%", boxSizing: "border-box", minHeight: isNarrow ? "480px" : 0, position: "relative" }}>
                        {graphLoading && graphData.points.length === 0 ? (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", minHeight: "440px" }}>
                            <LoadingDots color="bg-current" />
                          </div>
                        ) : (
                          canvasPanel
                        )}
                        {graphError && (
                          <div style={{ position: "absolute", top: "12px", left: "12px", fontFamily: SF_TEXT, fontSize: "12px", color: error }}>{graphError}</div>
                        )}
                      </div>
                    </Card>

                    { }
                    <Card bg={card} shadow={cardShadow} border={`1px solid ${divider}`} noPadding style={{ height: isNarrow ? undefined : "100%", minHeight: 0 }}>
                        <div style={{ padding: "20px", height: isNarrow ? undefined : "100%", boxSizing: "border-box", overflowY: "auto" }}>{detailPanel}</div>
                    </Card>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "tasks" && (
              <div className="h-full overflow-y-auto">
                <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
                  <Card bg={card} shadow={cardShadow} border={`1px solid ${divider}`} noPadding>
                    <div style={{ padding: "24px" }}>{tasksPanel}</div>
                  </Card>
                </div>
              </div>
            )}

            {activeTab === "models" && (
              <div className="h-full overflow-y-auto">
                <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
                  <Card bg={card} shadow={cardShadow} border={`1px solid ${divider}`} noPadding>
                    <div style={{ padding: "24px" }}>{modelsPanel}</div>
                  </Card>
                </div>
              </div>
            )}

            {activeTab === "datasets" && (
              <div className="h-full overflow-y-auto">
                <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>{datasetsPanel}</div>
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
                borderRadius: "20px",
                boxShadow: cardShadow,
                border: `1px solid ${divider}`,
                padding: "7px",
              }}
            >
              <Modal.Header>
                <Modal.Heading
                  style={{
                    fontFamily: SF_DISPLAY,
                    fontSize: "20px",
                    fontWeight: 600,
                    color: fg,
                    letterSpacing: "-0.4px",
                  }}
                >
                  确认登出？
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <p style={{ fontFamily: SF_TEXT, fontSize: "14px", color: fg2, letterSpacing: "-0.15px", margin: 0 }}>
                  登出后需要重新登录才能使用评测平台。
                </p>
              </Modal.Body>
              <Modal.Footer style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <PillButton fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={() => setShowLogoutConfirm(false)}>
                  取消
                </PillButton>
                <PillButton primary fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={() => void handleLogout()}>
                  登出
                </PillButton>
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
                borderRadius: "20px",
                boxShadow: cardShadow,
                border: `1px solid ${divider}`,
                padding: "7px",
              }}
            >
              <Modal.Header style={{ marginBottom: "16px" }}>
                <Modal.Heading
                  style={{
                    fontFamily: SF_DISPLAY,
                    fontSize: "20px",
                    fontWeight: 600,
                    color: fg,
                    letterSpacing: "-0.4px",
                  }}
                >
                  新建评测任务
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body style={{ padding: 0 }}>
                {ctLoadingData ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: "32px" }}>
                    <LoadingDots color="bg-current" />
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div>
                      <FieldLabel color={fg3}>任务名</FieldLabel>
                      <input
                        type="text"
                        value={ctName}
                        onChange={(e) => setCtName(e.target.value)}
                        placeholder="如 Qwen3-8B 全量评测"
                        style={inputBaseStyle(fg, inputBg, inputBorder)}
                      />
                    </div>

                    <div>
                      <FieldLabel color={fg3}>模型</FieldLabel>
                      <select
                        value={ctModelId}
                        onChange={(e) => setCtModelId(e.target.value)}
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
                      <FieldLabel color={fg3}>数据集（多选）</FieldLabel>
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
                          <span style={{ fontFamily: SF_TEXT, fontSize: "12px", color: fg4 }}>暂无数据集</span>
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
                        <FieldLabel color={fg3}>推理后端</FieldLabel>
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
                <PillButton fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={() => setShowCreateTask(false)}>
                  取消
                </PillButton>
                <PillButton primary fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={() => void submitCreateTask()} disabled={ctSubmitting || ctLoadingData}>
                  {ctSubmitting ? "创建中…" : "创建任务"}
                </PillButton>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      { }
      <Modal state={{ isOpen: reportTaskUid !== null, setOpen: (open: boolean) => { if (!open) setReportTaskUid(null); }, open: () => {}, close: () => setReportTaskUid(null), toggle: () => setReportTaskUid((prev) => (prev ? null : prev)) }}>
        <Modal.Backdrop variant="blur">
          <Modal.Container placement="center" size="md" scroll="inside" className="flex items-center justify-center">
            <Modal.Dialog
              style={{
                background: card,
                borderRadius: "20px",
                boxShadow: cardShadow,
                border: `1px solid ${divider}`,
                padding: "7px",
              }}
            >
              <Modal.Header style={{ marginBottom: "16px" }}>
                <Modal.Heading
                  style={{
                    fontFamily: SF_DISPLAY,
                    fontSize: "20px",
                    fontWeight: 600,
                    color: fg,
                    letterSpacing: "-0.4px",
                  }}
                >
                  评测报告
                </Modal.Heading>
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
                          fontSize: "48px",
                          fontWeight: 600,
                          color: fg,
                          letterSpacing: "-1px",
                          lineHeight: 1,
                        }}
                      >
                        {report.compositeScore.toFixed(1)}
                      </div>
                      <div style={{ fontFamily: SF_TEXT, fontSize: "12px", color: fg3, marginTop: "4px" }}>综合评分</div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                      {[
                        { label: "成本/任务", value: formatCost(report.costPerTask) },
                        { label: "P50 时延", value: `${report.latencyP50.toFixed(0)}ms` },
                        { label: "吞吐", value: `${report.throughput.toFixed(1)}/s` },
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
                      <FieldLabel color={fg3}>能力域得分</FieldLabel>
                      {report.domainScores.map((ds) => (
                        <DomainScoreBar key={ds.domain} ds={ds} fg={fg} fg2={fg2} fg3={fg3} divider={divider} />
                      ))}
                    </div>

                    {report.fingerprint && (
                      <div>
                        <FieldLabel color={fg3}>复现指纹</FieldLabel>
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
                <PillButton fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={() => setReportTaskUid(null)}>
                  关闭
                </PillButton>
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
                borderRadius: "20px",
                boxShadow: cardShadow,
                border: `1px solid ${divider}`,
                padding: "7px",
              }}
            >
              <Modal.Header style={{ marginBottom: "16px" }}>
                <Modal.Heading
                  style={{
                    fontFamily: SF_DISPLAY,
                    fontSize: "20px",
                    fontWeight: 600,
                    color: fg,
                    letterSpacing: "-0.4px",
                  }}
                >
                  模型对比 ({compareList.length}/4)
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
                        aria-label={`移除 ${p.name}`}
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
                      padding: "7px",
                    }}
                  >
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: SF_TEXT, fontSize: "13px" }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left", color: fg3, fontWeight: 600, padding: "8px 12px 8px 0", borderBottom: `1px solid ${divider}`, fontSize: "12px", letterSpacing: "0.02em", whiteSpace: "nowrap" }}>
                            指标
                          </th>
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
                          <td style={{ color: fg, fontWeight: 600, padding: "8px 12px 8px 0", borderBottom: `1px solid ${divider}`, letterSpacing: "-0.1px" }}>综合评分</td>
                          {compareList.map((p) => (
                            <td key={p.modelId} style={{ textAlign: "right", color: fg, fontWeight: 600, fontFamily: SF_MONO, fontSize: "12px", padding: "8px 0 8px 12px", borderBottom: `1px solid ${divider}` }}>
                              {p.compositeScore.toFixed(1)}
                            </td>
                          ))}
                        </tr>
                        <tr data-row>
                          <td style={{ color: fg2, padding: "8px 12px 0 0", letterSpacing: "-0.1px" }}>成本/任务</td>
                          {compareList.map((p) => (
                            <td key={p.modelId} style={{ textAlign: "right", color: fg, fontFamily: SF_MONO, fontSize: "12px", padding: "8px 0 0 12px" }}>
                              {formatCost(p.costPerTask)}
                            </td>
                          ))}
                        </tr>
                        <tr data-row>
                          <td style={{ color: fg2, padding: "8px 12px 0 0", letterSpacing: "-0.1px" }}>性价比排名</td>
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
                  <div style={{ fontFamily: SF_TEXT, fontSize: "14px", color: fg3, textAlign: "center", padding: "32px 0", letterSpacing: "-0.15px" }}>
                    至少选择 2 个模型后进行对比
                  </div>
                )}
              </Modal.Body>
              <Modal.Footer style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
                <PillButton fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={() => setShowCompare(false)}>
                  关闭
                </PillButton>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      { }
      <Modal state={{ isOpen: showRegisterModel, setOpen: setShowRegisterModel, open: () => setShowRegisterModel(true), close: () => setShowRegisterModel(false), toggle: () => setShowRegisterModel((prev) => !prev) }}>
        <Modal.Backdrop variant="blur">
          <Modal.Container placement="center" size="md" scroll="inside" className="flex items-center justify-center">
            <Modal.Dialog
              style={{
                background: card,
                borderRadius: "20px",
                boxShadow: cardShadow,
                border: `1px solid ${divider}`,
                padding: "7px",
              }}
            >
              <Modal.Header style={{ marginBottom: "16px" }}>
                <Modal.Heading
                  style={{
                    fontFamily: SF_DISPLAY,
                    fontSize: "20px",
                    fontWeight: 600,
                    color: fg,
                    letterSpacing: "-0.4px",
                  }}
                >
                  注册模型
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body style={{ padding: 0 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                      <FieldLabel color={fg3}>名称 *</FieldLabel>
                      <input
                        type="text"
                        value={rmName}
                        onChange={(e) => setRmName(e.target.value)}
                        placeholder="如 Qwen3-8B"
                        style={inputBaseStyle(fg, inputBg, inputBorder)}
                      />
                    </div>
                    <div>
                      <FieldLabel color={fg3}>厂商 *</FieldLabel>
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
                      <FieldLabel color={fg3}>系列 *</FieldLabel>
                      <input
                        type="text"
                        value={rmSeries}
                        onChange={(e) => setRmSeries(e.target.value)}
                        placeholder="如 Qwen3"
                        style={inputBaseStyle(fg, inputBg, inputBorder)}
                      />
                    </div>
                    <div>
                      <FieldLabel color={fg3}>版本 *</FieldLabel>
                      <input
                        type="text"
                        value={rmVersion}
                        onChange={(e) => setRmVersion(e.target.value)}
                        placeholder="如 1.0"
                        style={inputBaseStyle(fg, inputBg, inputBorder)}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                      <FieldLabel color={fg3}>接入方式</FieldLabel>
                      <select
                        value={rmAccessType}
                        onChange={(e) => setRmAccessType(e.target.value)}
                        style={{ ...inputBaseStyle(fg, inputBg, inputBorder), appearance: "none" }}
                      >
                        {ACCESS_TYPES.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <FieldLabel color={fg3}>推理后端</FieldLabel>
                      <select
                        value={rmBackend}
                        onChange={(e) => setRmBackend(e.target.value)}
                        style={{ ...inputBaseStyle(fg, inputBg, inputBorder), appearance: "none" }}
                      >
                        {BACKENDS.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                      <FieldLabel color={fg3}>参数量 (B，可选)</FieldLabel>
                      <input
                        type="number"
                        value={rmParamsB}
                        onChange={(e) => setRmParamsB(e.target.value)}
                        placeholder="如 8"
                        min={0}
                        step="any"
                        style={inputBaseStyle(fg, inputBg, inputBorder)}
                      />
                    </div>
                    <div>
                      <FieldLabel color={fg3}>上下文长度（可选）</FieldLabel>
                      <input
                        type="number"
                        value={rmContextLength}
                        onChange={(e) => setRmContextLength(e.target.value)}
                        placeholder="如 32768"
                        min={0}
                        step={1}
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
                <PillButton fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={() => setShowRegisterModel(false)}>
                  取消
                </PillButton>
                <PillButton primary fg={fg} fg3={fg3} accent={accent} accentFg={accentFg} divider={divider} onClick={() => void submitRegisterModel()} disabled={rmSubmitting}>
                  {rmSubmitting ? "注册中…" : "注册"}
                </PillButton>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
