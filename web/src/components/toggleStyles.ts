/** 明暗 / 中英 / 登出 共用尺寸：贴合 48px 导航，视觉成组 */
export const TOGGLE_BTN =
  "inline-flex items-center justify-center p-2 rounded-full transition-colors duration-200";

export const TOGGLE_BTN_HOVER_DARK = "hover:bg-[rgba(255,255,255,0.08)]";
export const TOGGLE_BTN_HOVER_LIGHT = "hover:bg-[rgba(0,0,0,0.05)]";

/** 图标占位：20×20，与 Theme / Logout SVG 一致 */
export const TOGGLE_ICON_BOX = "w-5 h-5";

export function toggleButtonClass(isDark: boolean, className = ""): string {
  return [
    TOGGLE_BTN,
    isDark ? TOGGLE_BTN_HOVER_DARK : TOGGLE_BTN_HOVER_LIGHT,
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export function toggleIconColor(isDark: boolean): string {
  return isDark ? "text-white" : "text-black";
}
