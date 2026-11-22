"use client";

import Link from "next/link";
import { FormEvent } from "react";
import { Alert, Button, FieldError, Input, Label, TextField } from "@heroui/react";
import { AuthCheckbox } from "@/components/auth/AuthCheckbox";
import { AuthLogo } from "@/components/auth/AuthLogo";
import { PasswordEye } from "@/components/auth/PasswordEye";
import { AUTH_BASE } from "@/components/auth/constants";
import { useI18n } from "@/context/LocaleContext";

export interface RegisterFormProps {
    email: string;
    phone: string;
    password: string;
    confirmPassword: string;
    agreeTerms: boolean;
    showPassword: boolean;
    showConfirmPassword: boolean;
    isSubmitting: boolean;
    errorMsg: string;
    emailError: string;
    phoneError: string;
    passwordError: string;
    confirmError: string;
    termsError: string;
    onEmailChange: (value: string) => void;
    onPhoneChange: (value: string) => void;
    onPasswordChange: (value: string) => void;
    onConfirmPasswordChange: (value: string) => void;
    onAgreeTermsChange: (value: boolean) => void;
    onToggleShowPassword: () => void;
    onToggleShowConfirmPassword: () => void;
    onEmailFocus: () => void;
    onEmailBlur: () => void;
    onPasswordFocus: () => void;
    onPasswordBlur: () => void;
    onSubmit: (e: FormEvent) => void;
}

export default function RegisterForm(props: RegisterFormProps) {
    const { t } = useI18n();
    const {
        email, phone, password, confirmPassword, agreeTerms, showPassword, showConfirmPassword,
        isSubmitting, errorMsg, emailError, phoneError, passwordError, confirmError, termsError,
        onEmailChange, onPhoneChange, onPasswordChange, onConfirmPasswordChange, onAgreeTermsChange,
        onToggleShowPassword, onToggleShowConfirmPassword, onEmailFocus, onEmailBlur, onPasswordFocus,
        onPasswordBlur, onSubmit,
    } = props;

    return (
        <div className="auth-form-column font-text">
            <AuthLogo />
            <header className="mb-9 text-center">
                <h1 className="font-display" style={{ color: "var(--fg)", fontSize: 28, fontWeight: 600, letterSpacing: "-0.28px", lineHeight: 1.14 }}>
                    {t("register.title")}
                </h1>
                <p className="mt-1.5 text-sm" style={{ color: "var(--fg-3)" }}>{t("register.subtitle")}</p>
            </header>

            <form onSubmit={onSubmit}>
                <div className="mb-5">
                    <TextField fullWidth name="email" type="email" value={email} onChange={onEmailChange} isInvalid={Boolean(emailError)} validationBehavior="aria">
                        <Label>{t("common.email")}</Label>
                        <Input placeholder="you@example.com" autoComplete="email" onFocus={onEmailFocus} onBlur={onEmailBlur} />
                        {emailError ? <FieldError>{emailError}</FieldError> : null}
                    </TextField>
                </div>

                <div className="mb-5">
                    <TextField fullWidth name="phone" type="tel" value={phone} onChange={onPhoneChange} isInvalid={Boolean(phoneError)} validationBehavior="aria">
                        <Label>
                            {t("register.phoneLabel")}{" "}
                            <span className="font-normal" style={{ color: "var(--fg-3)" }}>{t("register.phoneOptional")}</span>
                        </Label>
                        <Input placeholder={t("register.phonePlaceholder")} autoComplete="tel" inputMode="numeric" maxLength={11} />
                        {phoneError ? <FieldError>{phoneError}</FieldError> : null}
                    </TextField>
                </div>

                <div className="relative mb-5">
                    <TextField fullWidth name="password" type={showPassword ? "text" : "password"} value={password} onChange={onPasswordChange} isInvalid={Boolean(passwordError)} validationBehavior="aria">
                        <Label>{t("common.password")}</Label>
                        <Input className="pr-11" placeholder={t("login.passwordPlaceholder")} autoComplete="new-password" onFocus={onPasswordFocus} onBlur={onPasswordBlur} />
                        {passwordError ? <FieldError>{passwordError}</FieldError> : null}
                    </TextField>
                    <div className="absolute right-2" style={{ top: "2.15rem" }}>
                        <PasswordEye visible={showPassword} onToggle={onToggleShowPassword} />
                    </div>
                </div>

                <div className="relative mb-5">
                    <TextField fullWidth name="confirmPassword" type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={onConfirmPasswordChange} isInvalid={Boolean(confirmError)} validationBehavior="aria">
                        <Label>{t("register.confirmPasswordLabel")}</Label>
                        <Input className="pr-11" placeholder={t("register.confirmPasswordPlaceholder")} autoComplete="new-password" onFocus={onPasswordFocus} onBlur={onPasswordBlur} />
                        {confirmError ? <FieldError>{confirmError}</FieldError> : null}
                    </TextField>
                    <div className="absolute right-2" style={{ top: "2.15rem" }}>
                        <PasswordEye visible={showConfirmPassword} onToggle={onToggleShowConfirmPassword} />
                    </div>
                </div>

                <div className="mb-6">
                    <AuthCheckbox name="terms" isSelected={agreeTerms} onChange={onAgreeTermsChange} isInvalid={Boolean(termsError)}>
                        <span className="text-sm">{t("register.termsLabel")}</span>
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
                    {isSubmitting ? t("register.creating") : t("register.signUpButton")}
                </Button>
            </form>

            <p className="mt-8 text-center text-sm" style={{ color: "var(--fg-3)" }}>
                {t("register.hasAccountPrompt")}{" "}
                <Link href={`${AUTH_BASE}/login`} className="no-underline hover:underline" style={{ color: "var(--fg)", fontWeight: 600 }}>
                    {t("register.logInLink")}
                </Link>
            </p>
        </div>
    );
}
