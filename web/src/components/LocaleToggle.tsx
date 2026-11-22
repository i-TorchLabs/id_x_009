"use client";

import type { HTMLAttributes } from "react";
import { useI18n } from "@/context/LocaleContext";
import { useTheme } from "@/context/ThemeContext";
import {
  TOGGLE_ICON_BOX,
  toggleButtonClass,
  toggleIconColor,
} from "@/components/toggleStyles";

interface LocaleToggleProps extends HTMLAttributes<HTMLButtonElement> {}

/** 右上角「中 / EN」切换：外壳与图标尺寸对齐 ThemeToggle */
export function LocaleToggle({ className = "", ...props }: LocaleToggleProps) {
  const { locale, toggleLocale, t } = useI18n();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  // 展示「切换后」目标语言，与主题钮「点按即切换到对面」语义一致
  const nextLabel = locale === "zh" ? "EN" : "中";

  return (
    <button
      type="button"
      onClick={toggleLocale}
      className={toggleButtonClass(isDark, className)}
      aria-label={t("a11y.langToggle")}
      title={locale === "zh" ? t("common.switchToEn") : t("common.switchToZh")}
      {...props}
    >
      <span
        className={`${TOGGLE_ICON_BOX} ${toggleIconColor(isDark)} inline-flex items-center justify-center select-none`}
        style={{
          fontSize: nextLabel === "EN" ? 11 : 13,
          fontWeight: 600,
          letterSpacing: nextLabel === "EN" ? "-0.02em" : "0",
          lineHeight: 1,
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
        aria-hidden
      >
        {nextLabel}
      </span>
    </button>
  );
}
