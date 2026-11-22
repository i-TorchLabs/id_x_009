"use client";

/**
 * 忘记密码页（STANDARD-FRONTEND）
 * 无密码框：密码相关动画 prop 固定为 false/0；成功态同页切换。
 */

import { FormEvent, useState } from "react";
import LeftPanel from "@/components/LeftPanel";
import ForgotPasswordForm from "@/components/ForgotPasswordForm";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LocaleToggle } from "@/components/LocaleToggle";
import { EMAIL_REGEX } from "@/components/auth/constants";
import { useTheme } from "@/context/ThemeContext";
import { useI18n } from "@/context/LocaleContext";
import { userGraphqlApi } from "@/api/graphql";

export default function ForgotPasswordPage() {
    const { theme } = useTheme();
    const { t } = useI18n();

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
            setEmailError(t("forgotPassword.errorValidEmailRequired"));
            ok = false;
        } else {
            setEmailError("");
        }
        if (!agreeTerms) {
            setTermsError(t("forgotPassword.errorTermsRequired"));
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
                        t("forgotPassword.successBody", { email: email.trim() }),
                );
            } else {
                setErrorMsg(result.forgotPassword.message || t("forgotPassword.errorRequestFailed"));
            }
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : t("common.networkError"));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="relative h-screen overflow-hidden">
            <div className="absolute top-4 right-4 z-50 flex items-center gap-0">
                <LocaleToggle />
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
