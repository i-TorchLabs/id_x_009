"use client";

/**
 * 注册页（STANDARD-FRONTEND）
 * 成功后不自动登录，跳转 login?registered=true。
 */

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import LeftPanel from "@/components/LeftPanel";
import RegisterForm from "@/components/RegisterForm";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LocaleToggle } from "@/components/LocaleToggle";
import {
    AUTH_BASE,
    EMAIL_REGEX,
    PASSWORD_MIN_LEN,
    PHONE_REGEX,
} from "@/components/auth/constants";
import { useTheme } from "@/context/ThemeContext";
import { useI18n } from "@/context/LocaleContext";
import { userGraphqlApi } from "@/api/graphql";

export default function RegisterPage() {
    const router = useRouter();
    const { theme } = useTheme();
    const { t } = useI18n();

    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [agreeTerms, setAgreeTerms] = useState(true);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const [isPasswordFocused, setIsPasswordFocused] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [emailError, setEmailError] = useState("");
    const [phoneError, setPhoneError] = useState("");
    const [passwordError, setPasswordError] = useState("");
    const [confirmError, setConfirmError] = useState("");
    const [termsError, setTermsError] = useState("");

    const validate = (): boolean => {
        let ok = true;
        const trimmed = email.trim();
        if (!trimmed || !EMAIL_REGEX.test(trimmed)) {
            setEmailError(t("register.errorValidEmailRequired"));
            ok = false;
        } else {
            setEmailError("");
        }

        const phoneTrim = phone.trim();
        if (phoneTrim && !PHONE_REGEX.test(phoneTrim)) {
            setPhoneError(t("register.errorPhoneInvalid"));
            ok = false;
        } else {
            setPhoneError("");
        }

        if (!password || password.length < PASSWORD_MIN_LEN) {
            setPasswordError(t("register.errorPasswordMinLength", { min: PASSWORD_MIN_LEN }));
            ok = false;
        } else {
            setPasswordError("");
        }

        if (confirmPassword !== password) {
            setConfirmError(t("register.errorPasswordMismatch"));
            ok = false;
        } else {
            setConfirmError("");
        }

        if (!agreeTerms) {
            setTermsError(t("register.errorTermsRequired"));
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
            const cleanPhone = phone.trim();
            const result = await userGraphqlApi.register({
                email: email.trim(),
                password,
                confirmPassword,
                ...(cleanPhone ? { phone: cleanPhone } : {}),
            });
            if (result.register.success) {
                router.push(`${AUTH_BASE}/login?registered=true`);
            } else {
                setErrorMsg(result.register.message || t("register.errorRegisterFailed"));
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
                    isPasswordFocused={isPasswordFocused}
                    showPassword={showPassword}
                    passwordLength={password.length}
                    isDark={theme === "dark"}
                />

                <div
                    className="flex items-center justify-center p-8 md:p-10 theme-transition"
                    style={{ background: "var(--bg)" }}
                >
                    <RegisterForm
                        email={email}
                        phone={phone}
                        password={password}
                        confirmPassword={confirmPassword}
                        agreeTerms={agreeTerms}
                        showPassword={showPassword}
                        showConfirmPassword={showConfirmPassword}
                        isSubmitting={isSubmitting}
                        errorMsg={errorMsg}
                        emailError={emailError}
                        phoneError={phoneError}
                        passwordError={passwordError}
                        confirmError={confirmError}
                        termsError={termsError}
                        onEmailChange={setEmail}
                        onPhoneChange={setPhone}
                        onPasswordChange={setPassword}
                        onConfirmPasswordChange={setConfirmPassword}
                        onAgreeTermsChange={setAgreeTerms}
                        onToggleShowPassword={() => setShowPassword((v) => !v)}
                        onToggleShowConfirmPassword={() => setShowConfirmPassword((v) => !v)}
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
