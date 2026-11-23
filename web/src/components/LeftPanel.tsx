"use client";

import React from "react";
import { AnimatedCharacters } from "./AnimatedCharacters";
import { useI18n } from "@/context/LocaleContext";

interface LeftPanelProps {
  isTyping: boolean;
  isPasswordFocused: boolean;
  showPassword: boolean;
  passwordLength: number;
  isDark?: boolean;
}

export default function LeftPanel({
  isTyping,
  isPasswordFocused,
  showPassword,
  passwordLength,
  isDark = false,
}: LeftPanelProps) {
  const { t } = useI18n();
  const overlayBg = isDark
    ? "rgba(28, 28, 30, 0.55)"
    : "rgba(212, 212, 218, 0.42)";
  const linkColor = isDark
    ? "rgba(200, 200, 200, 0.7)"
    : "rgba(60, 60, 60, 0.7)";

  return (
    <div className="relative hidden md:flex flex-col justify-between px-10 py-10 overflow-hidden">
      {/* ── Background: vivid color blobs as blur source ── */}
      <div className="absolute inset-0 z-0">
        <div
          className="absolute top-[10%] left-[5%] w-75 h-75 rounded-full"
          style={{
            background: isDark
              ? "rgba(60, 60, 60, 0.4)"
              : "rgba(175, 175, 182, 0.6)",
            filter: "blur(80px)",
          }}
        />
        <div
          className="absolute top-[30%] right-[10%] w-65 h-65 rounded-full"
          style={{
            background: isDark
              ? "rgba(80, 80, 80, 0.3)"
              : "rgba(180, 180, 187, 0.55)",
            filter: "blur(80px)",
          }}
        />
        <div
          className="absolute bottom-[10%] left-[15%] w-87.5 h-87.5 rounded-full"
          style={{
            background: isDark
              ? "rgba(50, 50, 50, 0.25)"
              : "rgba(190, 190, 197, 0.5)",
            filter: "blur(100px)",
          }}
        />
        <div
          className="absolute bottom-[25%] right-[5%] w-50 h-50 rounded-full"
          style={{
            background: isDark
              ? "rgba(70, 70, 70, 0.3)"
              : "rgba(178, 178, 185, 0.55)",
            filter: "blur(70px)",
          }}
        />
      </div>

      {/* ── Frosted glass overlay ── */}
      <div
        className="absolute inset-0 z-1"
        style={{
          background: overlayBg,
          backdropFilter: "saturate(180%) blur(20px)",
          WebkitBackdropFilter: "saturate(180%) blur(20px)",
        }}
      />

      {/* Logo */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2.5 px-3 py-2 rounded-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/favicon.ico"
          alt="ID-009 logo"
          className="w-7 h-7"
        />
        {/* 主题适配：浅色模式为黑色，深色模式保持白色以保证可读性 */}
        <span
          className="font-display text-base font-semibold tracking-[-0.2px]"
          style={{ color: isDark ? "#ffffff" : "#1d1d1f" }}
        >
          ID-009
        </span>
      </div>

      {/* Animated Characters */}
      <div className="relative z-10 flex-1 flex items-center justify-center min-h-0">
        <AnimatedCharacters
          isTyping={isTyping}
          isPasswordFocused={isPasswordFocused}
          showPassword={showPassword}
          passwordLength={passwordLength}
        />
      </div>

      {/* Footer Links · STANDARD-UI §8.4.1 */}
      <div
        className="absolute left-2 bottom-2 z-10 flex gap-7 font-text text-[13px]"
        style={{ color: linkColor }}
      >
        <a href="#" className="transition-opacity duration-200 hover:opacity-80" style={{ color: linkColor }}>
          {t("common.privacyPolicy")}
        </a>
        <a href="#" className="transition-opacity duration-200 hover:opacity-80" style={{ color: linkColor }}>
          {t("common.terms")}
        </a>
        <a href="#" className="transition-opacity duration-200 hover:opacity-80" style={{ color: linkColor }}>
          {t("common.contact")}
        </a>
      </div>
    </div>
  );
}
