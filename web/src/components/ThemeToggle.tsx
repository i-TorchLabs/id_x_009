"use client";

import { useTheme } from "@/context/ThemeContext";
import type { HTMLAttributes } from "react";
import {
  TOGGLE_ICON_BOX,
  toggleButtonClass,
  toggleIconColor,
} from "@/components/toggleStyles";

interface ThemeToggleProps extends HTMLAttributes<HTMLButtonElement> {}

export function ThemeToggle({ className = "", ...props }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={toggleButtonClass(isDark, className)}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      {...props}
    >
      {isDark ? (
        <svg
          className={`${TOGGLE_ICON_BOX} ${toggleIconColor(true)}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        <svg
          className={`${TOGGLE_ICON_BOX} ${toggleIconColor(false)}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
