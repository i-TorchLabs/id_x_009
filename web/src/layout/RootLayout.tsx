import type { Metadata } from "next";
import { Providers } from "@/layout/Providers";
import "@/assets/styles/globals.css";

export const metadata: Metadata = {
    title: "AI 模型评测平台",
    description:
        "标准化、自动化、可复现的 AI 模型评测工作台：评分图谱、评测任务、模型注册与数据集管理。",
    icons: {
        icon: "/favicon.ico",
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className="antialiased">
            <body className="h-screen overflow-hidden">
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
