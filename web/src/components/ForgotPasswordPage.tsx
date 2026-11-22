"use client";

/**
 * 忘记密码页（STANDARD-FRONTEND）
 * 无密码框：密码相关动画 prop 固定为 false/0；成功态同页切换。
 */

import { FormEvent, useState } from "react";
import LeftPanel from "@/components/LeftPanel";
import ForgotPasswordForm from "@/components/ForgotPasswordForm";
import { ThemeToggle } from "@/components/ThemeToggle";
import { EMAIL_REGEX } from "@/components/auth/constants";
import { useTheme } from "@/context/ThemeContext";
import { userGraphqlApi } from "@/api/graphql";

export default function ForgotPasswordPage() {
    const { theme } = useTheme();

    const [email, setEmail] = useState("");
    const [agreeTerms, setAgreeTerms] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [emailError, setEmailError] = useState("");
    const [termsError, setTermsError] = useState("");
    const [successMessage, setSuccessMessage] = useState("");

    const validate = (): boolean => {
        let ok = true;
        const trimmed = email.trim();
        if (!trimmed || !EMAIL_REGEX.test(trimmed)) {
            setEmailError("请输入有效邮箱");
            ok = false;
        } else {
            setEmailError("");
        }
        if (!agreeTerms) {
            setTermsError("请先同意服务条款");
            ok = false;
        } else {
            setTermsError("");
        }
        return ok;
    };

    const onSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setErrorMsg("");
        if (!validate()) return;

        setIsSubmitting(true);
        try {
            const result = await userGraphqlApi.forgotPassword({
                email: email.trim(),
            });
            if (result.forgotPassword.success) {
                setIsSuccess(true);
                setSuccessMessage(
                    result.forgotPassword.message ||
                        `若邮箱 ${email.trim()} 已注册，重置说明已发送`,
                );
            } else {
                setErrorMsg(result.forgotPassword.message || "请求失败，请稍后重试");
            }
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : "网络错误，请稍后重试");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="relative h-screen overflow-hidden">
            <div className="absolute top-4 right-4 z-50 flex items-center gap-1">
                <ThemeToggle />
            </div>

            <div className="grid h-full grid-cols-1 md:grid-cols-2">
                <LeftPanel
                    isTyping={isTyping}
                    isPasswordFocused={false}
                    showPassword={false}
                    passwordLength={0}
                    isDark={theme === "dark"}
                />

                <div
                    className="flex items-center justify-center p-8 md:p-10 theme-transition"
                    style={{ background: "var(--bg)" }}
                >
                    <ForgotPasswordForm
                        email={email}
                        agreeTerms={agreeTerms}
                        isSubmitting={isSubmitting}
                        isSuccess={isSuccess}
                        errorMsg={errorMsg}
                        emailError={emailError}
                        termsError={termsError}
                        successMessage={successMessage}
                        onEmailChange={setEmail}
                        onAgreeTermsChange={setAgreeTerms}
                        onEmailFocus={() => setIsTyping(true)}
                        onEmailBlur={() => setIsTyping(false)}
                        onSubmit={onSubmit}
                    />
                </div>
            </div>
        </div>
    );
}
