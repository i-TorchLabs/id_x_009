"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";
import { useI18n } from "@/context/LocaleContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LocaleToggle } from "@/components/LocaleToggle";
import { LoadingDots } from "@/components/ui/LoadingDots";
import { evalGraphqlApi, type ScorePoint } from "@/api/graphql";
import { getTokens, SF_DISPLAY, SF_TEXT, SF_MONO } from "@/utils/tokens";

const ease = [0.25, 0.4, 0.25, 1] as [number, number, number, number];
const REFRESH_MS = 60_000;

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

export default function Dashboard() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { t: tx } = useI18n();
  const tokens = getTokens(isDark);
  const { bg, card, fg, fg2, fg3, divider, shadow: cardShadow, error } = tokens;

  const [graphData, setGraphData] = useState<{
    points: ScorePoint[];
    frontier: { x: number; y: number }[];
    vendors: string[];
  }>({ points: [], frontier: [], vendors: [] });
  const [graphLoading, setGraphLoading] = useState(true);
  const [graphError, setGraphError] = useState("");
  const [hoverPoint, setHoverPoint] = useState<{
    point: ScorePoint;
    cx: number;
    cy: number;
  } | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 960, h: 640 });
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const canvasResizeRef = useRef<ResizeObserver | null>(null);

  const observeCanvas = useCallback((el: HTMLDivElement | null) => {
    if (canvasResizeRef.current) {
      canvasResizeRef.current.disconnect();
      canvasResizeRef.current = null;
    }
    if (el) {
      const ro = new ResizeObserver((entries) => {
        const rect = entries[0].contentRect;
        setCanvasSize({
          w: Math.max(320, rect.width),
          h: Math.max(280, rect.height),
        });
      });
      ro.observe(el);
      canvasResizeRef.current = ro;
    }
  }, []);

  const loadGraph = useCallback(async () => {
    setGraphLoading(true);
    setGraphError("");
    try {
      const r = await evalGraphqlApi.getScoreCostGraph();
      setGraphData(r.scoreCostGraph);
      setUpdatedAt(new Date());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : tx("common.loadingFailed");
      setGraphError(msg || tx("common.loadingFailed"));
    } finally {
      setGraphLoading(false);
    }
  }, [tx]);

  useEffect(() => {
    void loadGraph();
    const timer = window.setInterval(() => void loadGraph(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadGraph]);

  useEffect(() => {
    return () => {
      if (canvasResizeRef.current) {
        canvasResizeRef.current.disconnect();
        canvasResizeRef.current = null;
      }
    };
  }, []);

  const geom = useMemo(() => {
    const { points, frontier } = graphData;
    const W = canvasSize.w;
    const H = canvasSize.h;
    const ML = 64;
    const MR = 28;
    const MT = 28;
    const MB = 56;
    const plotW = W - ML - MR;
    const plotH = H - MT - MB;

    if (points.length === 0) {
      return {
        W,
        H,
        ML,
        MR,
        MT,
        MB,
        plotW,
        plotH,
        yMin: 0,
        yMax: 100,
        logMin: 0,
        logMax: 1,
        xTicks: [] as number[],
        yTicks: [] as number[],
        toX: (_c: number) => 0,
        toY: (_s: number) => 0,
        seriesLines: [] as { pts: { x: number; y: number }[]; vendor: string }[],
        frontierPts: [] as { x: number; y: number }[],
      };
    }

    const costs = points.map((p) => p.costPerTask).filter((cost) => cost > 0);
    const scores = points.map((p) => p.compositeScore);
    let cMin = Math.min(...costs);
    let cMax = Math.max(...costs);
    if (cMax <= cMin) cMax = cMin * 10;

    let sMin = Math.min(...scores);
    let sMax = Math.max(...scores);
    if (sMax <= sMin) sMax = sMin + 10;
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
        seriesLines.push({
          pts: sorted.map((p) => ({
            x: toX(p.costPerTask),
            y: toY(p.compositeScore),
          })),
          vendor: g[0].vendor,
        });
      }
    }

    const frontierPts = [...frontier]
      .sort((a, b) => a.x - b.x)
      .map((f) => ({ x: toX(f.x), y: toY(f.y) }));

    return {
      W,
      H,
      ML,
      MR,
      MT,
      MB,
      plotW,
      plotH,
      yMin,
      yMax,
      logMin,
      logMax,
      xTicks,
      yTicks,
      toX,
      toY,
      seriesLines,
      frontierPts,
    };
  }, [graphData, canvasSize]);

  const updatedLabel = updatedAt
    ? updatedAt.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";

  return (
    <div
      className="min-h-screen w-full flex flex-col"
      style={{ background: bg, color: fg }}
    >
      <header
        className="flex items-center justify-between gap-4 flex-wrap"
        style={{
          padding: "18px 28px 12px",
          borderBottom: `1px solid ${divider}`,
          flexShrink: 0,
        }}
      >
        <div className="min-w-0">
          <div
            style={{
              fontFamily: SF_DISPLAY,
              fontSize: "28px",
              fontWeight: 650,
              letterSpacing: "-0.04em",
              lineHeight: 1.1,
            }}
          >
            {tx("common.productName")}
          </div>
          <div
            style={{
              fontFamily: SF_TEXT,
              fontSize: "14px",
              color: fg3,
              marginTop: "4px",
              letterSpacing: "-0.01em",
            }}
          >
            {tx("dashboard.subtitle")}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span
            style={{
              fontFamily: SF_MONO,
              fontSize: "12px",
              color: fg3,
            }}
          >
            {tx("dashboard.updatedAt", { time: updatedLabel })}
          </span>
          <LocaleToggle />
          <ThemeToggle />
        </div>
      </header>

      <main
        className="flex-1 min-h-0"
        style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column" }}
      >
        <div
          style={{
            flex: 1,
            minHeight: 0,
            background: card,
            borderRadius: "16px",
            boxShadow: cardShadow,
            padding: "14px 16px 12px",
            display: "flex",
            flexDirection: "column",
            position: "relative",
          }}
        >
          {graphData.vendors.length > 0 && (
            <div
              className="flex flex-wrap items-center"
              style={{
                gap: "6px 16px",
                padding: "2px 4px 12px",
                borderBottom: `1px solid ${divider}`,
                marginBottom: "10px",
                flexShrink: 0,
              }}
            >
              {[...graphData.vendors].sort().map((v) => (
                <span key={v} className="inline-flex items-center gap-1.5">
                  <span
                    style={{
                      display: "inline-block",
                      width: "9px",
                      height: "9px",
                      borderRadius: "50%",
                      background: vendorColor(v, graphData.vendors),
                    }}
                  />
                  <span
                    style={{
                      fontFamily: SF_TEXT,
                      fontSize: "12px",
                      color: fg2,
                      letterSpacing: "-0.1px",
                    }}
                  >
                    {v}
                  </span>
                </span>
              ))}
              {graphData.frontier.length >= 2 && (
                <span className="inline-flex items-center gap-1.5">
                  <svg width="18" height="8" style={{ display: "inline-block" }}>
                    <line
                      x1="0"
                      y1="4"
                      x2="18"
                      y2="4"
                      stroke={PARETO_COLOR}
                      strokeOpacity={PARETO_STROKE_OPACITY}
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                    />
                  </svg>
                  <span
                    style={{
                      fontFamily: SF_TEXT,
                      fontSize: "12px",
                      color: fg2,
                      letterSpacing: "-0.1px",
                    }}
                  >
                    {tx("home.paretoFront")}
                  </span>
                </span>
              )}
            </div>
          )}

          <div
            ref={observeCanvas}
            style={{ position: "relative", width: "100%", flex: 1, minHeight: 0 }}
          >
            {graphLoading && graphData.points.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  minHeight: "360px",
                }}
              >
                <LoadingDots color="bg-current" />
              </div>
            ) : graphData.points.length === 0 ? (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: SF_TEXT,
                  fontSize: "16px",
                  color: fg3,
                  textAlign: "center",
                  padding: "48px 24px",
                }}
              >
                {tx("home.emptyEvalData")}
              </div>
            ) : (
              <svg width={geom.W} height={geom.H} style={{ display: "block" }}>
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

                <line
                  x1={geom.ML}
                  x2={geom.W - geom.MR}
                  y1={geom.H - geom.MB}
                  y2={geom.H - geom.MB}
                  stroke={fg}
                  strokeOpacity={0.25}
                  strokeWidth={1}
                />
                <line
                  x1={geom.ML}
                  x2={geom.ML}
                  y1={geom.MT}
                  y2={geom.H - geom.MB}
                  stroke={fg}
                  strokeOpacity={0.25}
                  strokeWidth={1}
                />

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
                      y={geom.H - geom.MB + 20}
                      textAnchor="middle"
                      style={{ fontFamily: SF_MONO, fontSize: "11px", fill: fg3 }}
                    >
                      {label}
                    </text>
                  );
                })}
                {geom.yTicks.map((v) => (
                  <text
                    key={`ty-${v}`}
                    x={geom.ML - 10}
                    y={geom.toY(v) + 4}
                    textAnchor="end"
                    style={{ fontFamily: SF_MONO, fontSize: "11px", fill: fg3 }}
                  >
                    {v}
                  </text>
                ))}

                <text
                  x={geom.ML + geom.plotW / 2}
                  y={geom.H - 10}
                  textAnchor="middle"
                  style={{
                    fontFamily: SF_TEXT,
                    fontSize: "12px",
                    fill: fg3,
                    letterSpacing: "0.02em",
                  }}
                >
                  {tx("home.axisCostLog")}
                </text>
                <text
                  x={16}
                  y={geom.MT + geom.plotH / 2}
                  textAnchor="middle"
                  transform={`rotate(-90, 16, ${geom.MT + geom.plotH / 2})`}
                  style={{
                    fontFamily: SF_TEXT,
                    fontSize: "12px",
                    fill: fg3,
                    letterSpacing: "0.02em",
                  }}
                >
                  {tx("home.compositeScore")}
                </text>

                {geom.seriesLines.map((line, i) => (
                  <polyline
                    key={`series-${i}`}
                    points={line.pts.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke={vendorColor(line.vendor, graphData.vendors)}
                    strokeOpacity={SERIES_STROKE_OPACITY}
                    strokeWidth={1.4}
                  />
                ))}

                {geom.frontierPts.length >= 2 &&
                  (() => {
                    const pts = geom.frontierPts;
                    const bottom = geom.H - geom.MB;
                    const right = geom.W - geom.MR;
                    let stair = `M ${pts[0].x},${pts[0].y}`;
                    for (let i = 1; i < pts.length; i++) {
                      stair += ` H ${pts[i].x} V ${pts[i].y}`;
                    }
                    const area = `${stair} H ${right} V ${bottom} H ${pts[0].x} Z`;
                    const last = pts[pts.length - 1];
                    return (
                      <>
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
                          strokeWidth={1.6}
                          strokeDasharray="6 4"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.8, delay: 0.3, ease }}
                        />
                        {pts.map((p, i) => (
                          <circle
                            key={`fp-${i}`}
                            cx={p.x}
                            cy={p.y}
                            r={3.5}
                            fill={PARETO_COLOR}
                            fillOpacity={0.9}
                            style={{ pointerEvents: "none" }}
                          />
                        ))}
                        <text
                          x={Math.min(last.x + 4, right)}
                          y={last.y - 12}
                          textAnchor="end"
                          style={{
                            fontFamily: SF_TEXT,
                            fontSize: "11px",
                            fill: PARETO_COLOR,
                            letterSpacing: "0.02em",
                            fontWeight: 600,
                          }}
                        >
                          {tx("home.paretoBest")}
                        </text>
                        <text
                          x={right - 6}
                          y={bottom - 10}
                          textAnchor="end"
                          style={{
                            fontFamily: SF_TEXT,
                            fontSize: "11px",
                            fill: PARETO_COLOR,
                            opacity: 0.45,
                            letterSpacing: "0.02em",
                          }}
                        >
                          {tx("home.dominatedHint")}
                        </text>
                      </>
                    );
                  })()}

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
                  </g>
                )}

                {graphData.points.map((p, idx) => {
                  const cx = geom.toX(p.costPerTask);
                  const cy = geom.toY(p.compositeScore);
                  const color = vendorColor(p.vendor, graphData.vendors);
                  const isHovered = hoverPoint?.point.modelId === p.modelId;
                  const r = isHovered ? 13 : 10;
                  return (
                    <g key={p.modelId}>
                      {isHovered && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={r + 10}
                          fill={color}
                          fillOpacity={0.2}
                          style={{ pointerEvents: "none" }}
                        />
                      )}
                      <motion.circle
                        cx={cx}
                        cy={cy}
                        r={r}
                        fill={color}
                        fillOpacity={BUBBLE_FILL_OPACITY}
                        stroke={p.onFrontier ? PARETO_COLOR : "none"}
                        strokeWidth={p.onFrontier ? 2 : 0}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{
                          duration: 0.4,
                          delay: 0.12 + idx * 0.03,
                          ease,
                        }}
                        style={{
                          cursor: "pointer",
                          transformOrigin: `${cx}px ${cy}px`,
                        }}
                        onMouseEnter={() => setHoverPoint({ point: p, cx, cy })}
                        onMouseLeave={() => setHoverPoint(null)}
                      />
                    </g>
                  );
                })}
              </svg>
            )}

            {hoverPoint && (
              <div
                style={{
                  position: "absolute",
                  left: Math.min(hoverPoint.cx + 16, geom.W - 200),
                  top: Math.max(hoverPoint.cy - 12, 8),
                  background: card,
                  border: `1px solid ${divider}`,
                  borderRadius: "12px",
                  boxShadow: cardShadow,
                  padding: "12px 14px",
                  pointerEvents: "none",
                  zIndex: 10,
                  minWidth: "170px",
                }}
              >
                <div
                  style={{
                    fontFamily: SF_DISPLAY,
                    fontSize: "14px",
                    fontWeight: 600,
                    color: fg,
                    letterSpacing: "-0.2px",
                    marginBottom: "4px",
                  }}
                >
                  {hoverPoint.point.name}
                </div>
                <div
                  style={{
                    fontFamily: SF_TEXT,
                    fontSize: "12px",
                    color: fg3,
                    marginBottom: "8px",
                  }}
                >
                  {hoverPoint.point.vendor}
                </div>
                {hoverPoint.point.onFrontier && (
                  <div
                    style={{
                      fontFamily: SF_TEXT,
                      fontSize: "11px",
                      color: PARETO_COLOR,
                      fontWeight: 600,
                      marginBottom: "6px",
                    }}
                  >
                    {tx("home.paretoLegend")}
                  </div>
                )}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto auto",
                    gap: "3px 12px",
                    fontFamily: SF_MONO,
                    fontSize: "12px",
                    color: fg2,
                  }}
                >
                  <span style={{ color: fg3 }}>{tx("home.scoreShort")}</span>
                  <span>{hoverPoint.point.compositeScore.toFixed(1)}</span>
                  <span style={{ color: fg3 }}>{tx("home.costShort")}</span>
                  <span>{formatCost(hoverPoint.point.costPerTask)}</span>
                  <span style={{ color: fg3 }}>{tx("home.colInputPrice")}</span>
                  <span>
                    {formatPrice(
                      hoverPoint.point.inputPricePer1m,
                      tx("home.pendingPrice"),
                    )}
                  </span>
                  <span style={{ color: fg3 }}>{tx("home.colOutputPrice")}</span>
                  <span>
                    {formatPrice(
                      hoverPoint.point.outputPricePer1m,
                      tx("home.pendingPrice"),
                    )}
                  </span>
                  <span style={{ color: fg3 }}>{tx("home.valueForMoney")}</span>
                  <span>#{hoverPoint.point.valueRank}</span>
                </div>
              </div>
            )}

            {graphError && (
              <div
                style={{
                  position: "absolute",
                  top: "10px",
                  left: "10px",
                  fontFamily: SF_TEXT,
                  fontSize: "13px",
                  color: error,
                }}
              >
                {graphError}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
