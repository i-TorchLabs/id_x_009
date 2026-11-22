"use client";

import Link from "next/link";
import { FormEvent } from "react";
import { Alert, Button, FieldError, Input, Label, TextField } from "@heroui/react";
import { AuthCheckbox } from "@/components/auth/AuthCheckbox";
import { AuthLogo } from "@/components/auth/AuthLogo";
import { AUTH_BASE } from "@/components/auth/constants";
import { useI18n } from "@/context/LocaleContext";

export interface ForgotPasswordFormProps {
    email: string;
    agreeTerms: boolean;
    isSubmitting: boolean;
    isSuccess: boolean;
    errorMsg: string;
    emailError: string;
    termsError: string;
    successMessage: string;
    onEmailChange: (value: string) => void;
    onAgreeTermsChange: (value: boolean) => void;
    onEmailFocus: () => void;
    onEmailBlur: () => void;
    onSubmit: (e: FormEvent) => void;
}

export default function ForgotPasswordForm({
    email, agreeTerms, isSubmitting, isSuccess, errorMsg, emailError, termsError, successMessage,
    onEmailChange, onAgreeTermsChange, onEmailFocus, onEmailBlur, onSubmit,
}: ForgotPasswordFormProps) {
    const { t } = useI18n();

    if (isSuccess) {
        return (
            <div className="auth-form-column font-text text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "var(--success)", color: "var(--accent-fg)" }} aria-hidden>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                    </svg>
                </div>
                <h1 className="font-display mt-6" style={{ color: "var(--fg)", fontSize: 28, fontWeight: 600, letterSpacing: "-0.28px", lineHeight: 1.14 }}>
                    {t("forgotPassword.successTitle")}
                </h1>
                <p className="mt-2 text-sm" style={{ color: "var(--fg-3)" }}>
                    {successMessage || t("forgotPassword.successBody", { email })}
                </p>
                <Link href={`${AUTH_BASE}/login`} className="btn-primary mt-8 flex w-full items-center justify-center no-underline">
                    {t("forgotPassword.backToLogin")}
                </Link>
            </div>
        );
    }

    return (
        <div className="auth-form-column font-text">
            <AuthLogo />
            <header className="mb-9 text-center">
                <h1 className="font-display" style={{ color: "var(--fg)", fontSize: 28, fontWeight: 600, letterSpacing: "-0.28px", lineHeight: 1.14 }}>
                    {t("forgotPassword.title")}
                </h1>
                <p className="mt-1.5 text-sm" style={{ color: "var(--fg-3)" }}>{t("forgotPassword.subtitle")}</p>
            </header>

            <form onSubmit={onSubmit}>
                <div className="mb-5">
                    <TextField fullWidth name="email" type="email" value={email} onChange={onEmailChange} isInvalid={Boolean(emailError)} validationBehavior="aria">
                        <Label>{t("common.email")}</Label>
                        <Input placeholder="you@example.com" autoComplete="email" onFocus={onEmailFocus} onBlur={onEmailBlur} />
                        {emailError ? <FieldError>{emailError}</FieldError> : null}
                    </TextField>
                </div>

                <div className="mb-6">
                    <AuthCheckbox name="terms" isSelected={agreeTerms} onChange={onAgreeTermsChange} isInvalid={Boolean(termsError)}>
                        <span className="text-sm">{t("forgotPassword.termsLabel")}</span>
                    </AuthCheckbox>
                    {termsError ? <p className="mt-1 text-xs" style={{ color: "var(--error)" }}>{termsError}</p> : null}
                </div>

                {errorMsg ? (
                    <Alert status="danger" className="mb-4">
                        <Alert.Indicator />
                        <Alert.Content><Alert.Description>{errorMsg}</Alert.Description></Alert.Content>
                    </Alert>
                ) : null}

                <Button type="submit" variant="primary" size="lg" fullWidth isDisabled={isSubmitting} className="rounded-full font-semibold text-[17px] tracking-[-0.374px] min-h-11">
                    {isSubmitting ? t("forgotPassword.sending") : t("forgotPassword.submitButton")}
                </Button>
            </form>

            <p className="mt-8 text-center text-sm" style={{ color: "var(--fg-3)" }}>
                {t("forgotPassword.rememberPrompt")}{" "}
                <Link href={`${AUTH_BASE}/login`} className="no-underline hover:underline" style={{ color: "var(--fg)", fontWeight: 600 }}>
                    {t("forgotPassword.backToLogin")}
                </Link>
            </p>
        </div>
    );
}
