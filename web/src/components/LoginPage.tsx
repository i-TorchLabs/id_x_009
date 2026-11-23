"use client";

/**
 * 登录页（STANDARD-FRONTEND）
 * 分屏壳 + LeftPanel 动画 + LoginForm。
 */

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import LeftPanel from "@/components/LeftPanel";
import LoginForm from "@/components/LoginForm";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LocaleToggle } from "@/components/LocaleToggle";
import { AUTH_BASE, EMAIL_REGEX, PASSWORD_MIN_LEN } from "@/components/auth/constants";
import { useTheme } from "@/context/ThemeContext";
import { useI18n } from "@/context/LocaleContext";
import { userGraphqlApi } from "@/api/graphql";

export default function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { theme } = useTheme();
    const { t } = useI18n();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [remember, setRemember] = useState(true);
    const [showPassword, setShowPassword] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const [isPasswordFocused, setIsPasswordFocused] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [emailError, setEmailError] = useState("");
    const [passwordError, setPasswordError] = useState("");

    const registeredHint = searchParams.get("registered") === "true";

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (localStorage.getItem("token")) {
            router.replace(`${AUTH_BASE}/home`);
        }
    }, [router]);

    const validate = (): boolean => {
        let ok = true;
        const trimmed = email.trim();
        if (!trimmed || !EMAIL_REGEX.test(trimmed)) {
            setEmailError(t("login.errorValidEmailRequired"));
            ok = false;
        } else {
            setEmailError("");
        }
        if (!password || password.length < PASSWORD_MIN_LEN) {
            setPasswordError(t("login.errorPasswordMinLength", { min: PASSWORD_MIN_LEN }));
            ok = false;
        } else {
            setPasswordError("");
        }
        return ok;
    };

    const onSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setErrorMsg("");
        if (!validate()) return;

        setIsSubmitting(true);
        try {
            const result = await userGraphqlApi.login({
                email: email.trim(),
                password,
            });
            if (result.login.success && result.login.token) {
                localStorage.setItem("token", result.login.token);
                localStorage.setItem("user", JSON.stringify(result.login.user));
                if (remember) {
                    localStorage.setItem("remember", "1");
                } else {
                    localStorage.removeItem("remember");
                }
                router.push(`${AUTH_BASE}/home`);
            } else {
                setErrorMsg(result.login.message || t("login.errorLoginFailed"));
            }
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : t("common.networkError"));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="relative h-screen overflow-hidden">
            {/* 小屏无 LeftPanel 时仍显示左上角品牌；大屏由 LeftPanel 展示，此处隐藏避免重复 */}
            <div className="absolute top-4 left-4 z-50 flex items-center gap-2.5 md:hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/favicon.ico" alt="ID-009 logo" className="h-7 w-7" />
                <span
                    className="font-display text-base font-semibold tracking-[-0.2px]"
                    style={{ color: "var(--fg)" }}
                >
                    ID-009
                </span>
            </div>
            <div className="absolute top-4 right-4 z-50 flex items-center gap-0">
                <LocaleToggle />
                <ThemeToggle />
            </div>

            <div className="grid h-full grid-cols-1 md:grid-cols-2">
                <LeftPanel
                    isTyping={isTyping}
                    isPasswordFocused={isPasswordFocused}
                    showPassword={showPassword}
                    passwordLength={password.length}
                    isDark={theme === "dark"}
                />

                <div
                    className="flex items-center justify-center p-8 md:p-10 theme-transition"
                    style={{ background: "var(--bg)" }}
                >
                    <LoginForm
                        email={email}
                        password={password}
                        remember={remember}
                        showPassword={showPassword}
                        isSubmitting={isSubmitting}
                        errorMsg={errorMsg}
                        emailError={emailError}
                        passwordError={passwordError}
                        registeredHint={registeredHint}
                        onEmailChange={setEmail}
                        onPasswordChange={setPassword}
                        onRememberChange={setRemember}
                        onToggleShowPassword={() => setShowPassword((v) => !v)}
                        onEmailFocus={() => setIsTyping(true)}
                        onEmailBlur={() => setIsTyping(false)}
                        onPasswordFocus={() => setIsPasswordFocused(true)}
                        onPasswordBlur={() => setIsPasswordFocused(false)}
                        onSubmit={onSubmit}
                    />
                </div>
            </div>
        </div>
    );
}
