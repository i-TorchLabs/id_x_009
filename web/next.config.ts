import type { NextConfig } from "next";

const securityHeaders = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
    },
    {
        key: "Content-Security-Policy",
        value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "font-src 'self' data:",
            "connect-src 'self'",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
        ].join("; "),
    },
];

const nextConfig: NextConfig = {
    productionBrowserSourceMaps: false,
    async headers() {
        return [
            {
                source: "/:path*",
                headers: securityHeaders,
            },
        ];
    },
    async redirects() {
        return [
            {
                source: "/",
                destination: "/f/009/login",
                permanent: false,
            },
            // 旧路径兼容 → /f/009/*
            {
                source: "/f/login",
                destination: "/f/009/login",
                permanent: false,
            },
            {
                source: "/f/register",
                destination: "/f/009/register",
                permanent: false,
            },
            {
                source: "/f/forgot-password",
                destination: "/f/009/forgot-password",
                permanent: false,
            },
            {
                source: "/f/home",
                destination: "/f/009/home",
                permanent: false,
            },
            {
                source: "/f/dashboard",
                destination: "/f/009/dashboard",
                permanent: false,
            },
        ];
    },
    allowedDevOrigins: ["*"],
};

export default nextConfig;
