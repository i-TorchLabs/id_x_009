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
import {
    AUTH_BASE,
    EMAIL_REGEX,
    PASSWORD_MIN_LEN,
    PHONE_REGEX,
} from "@/components/auth/constants";
import { useTheme } from "@/context/ThemeContext";
import { userGraphqlApi } from "@/api/graphql";

export default function RegisterPage() {
    const router = useRouter();
    const { theme } = useTheme();

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
            setEmailError("请输入有效邮箱");
            ok = false;
        } else {
            setEmailError("");
        }

        const phoneTrim = phone.trim();
        if (phoneTrim && !PHONE_REGEX.test(phoneTrim)) {
            setPhoneError("手机号须为 11 位数字");
            ok = false;
        } else {
            setPhoneError("");
        }

        if (!password || password.length < PASSWORD_MIN_LEN) {
            setPasswordError(`密码至少 ${PASSWORD_MIN_LEN} 位`);
            ok = false;
        } else {
            setPasswordError("");
        }

        if (confirmPassword !== password) {
            setConfirmError("两次输入的密码不一致");
            ok = false;
        } else {
            setConfirmError("");
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
                setErrorMsg(result.register.message || "注册失败");
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
