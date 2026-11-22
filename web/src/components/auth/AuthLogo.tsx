"use client";

export function AuthLogo() {
    return (
        <div
            className="mx-auto mb-6 flex h-14 w-14 items-center justify-center"
            style={{ borderRadius: 12, color: "var(--fg)" }}
            aria-hidden
        >
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <rect x="2.75" y="2.75" width="22.5" height="22.5" rx="6" stroke="currentColor" strokeWidth="1.5" />
                <path
                    d="M8 14.2 11.4 17.6 20 9.8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        </div>
    );
}
