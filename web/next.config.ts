import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
        ];
    },
    allowedDevOrigins: ["*"],
};

export default nextConfig;
