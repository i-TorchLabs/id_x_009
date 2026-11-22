"use client";

import Link from "next/link";
import { FormEvent } from "react";
import { Alert, Button, FieldError, Input, Label, TextField } from "@heroui/react";
import { AuthCheckbox } from "@/components/auth/AuthCheckbox";
import { AuthLogo } from "@/components/auth/AuthLogo";
import { PasswordEye } from "@/components/auth/PasswordEye";
import { AUTH_BASE, AUTH_COPY } from "@/components/auth/constants";

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
    const {
        email,
        phone,
        password,
        confirmPassword,
        agreeTerms,
        showPassword,
        showConfirmPassword,
        isSubmitting,
        errorMsg,
        emailError,
        phoneError,
        passwordError,
        confirmError,
        termsError,
        onEmailChange,
        onPhoneChange,
        onPasswordChange,
        onConfirmPasswordChange,
        onAgreeTermsChange,
        onToggleShowPassword,
        onToggleShowConfirmPassword,
        onEmailFocus,
        onEmailBlur,
        onPasswordFocus,
        onPasswordBlur,
        onSubmit,
    } = props;

    return (
        <div className="w-full max-w-[400px] font-text">
            <AuthLogo />
            <header className="mb-9 text-center">
                <h1
                    className="font-display"
                    style={{
                        color: "var(--fg)",
                        fontSize: 28,
                        fontWeight: 600,
                        letterSpacing: "-0.28px",
                        lineHeight: 1.14,
                    }}
                >
                    {AUTH_COPY.registerTitle}
                </h1>
                <p className="mt-1.5 text-sm" style={{ color: "var(--fg-3)" }}>
                    {AUTH_COPY.registerSubtitle}
                </p>
            </header>

            <form onSubmit={onSubmit}>
                <div className="mb-5">
                    <TextField
                        fullWidth
                        name="email"
                        type="email"
                        value={email}
                        onChange={onEmailChange}
                        isInvalid={Boolean(emailError)}
                        validationBehavior="aria"
                    >
                        <Label>邮箱</Label>
                        <Input
                            placeholder="you@example.com"
                            autoComplete="email"
                            onFocus={onEmailFocus}
                            onBlur={onEmailBlur}
                        />
                        {emailError ? <FieldError>{emailError}</FieldError> : null}
                    </TextField>
                </div>

                <div className="mb-5">
                    <TextField
                        fullWidth
                        name="phone"
                        type="tel"
                        value={phone}
                        onChange={onPhoneChange}
                        isInvalid={Boolean(phoneError)}
                        validationBehavior="aria"
                    >
                        <Label>
                            手机号{" "}
                            <span className="font-normal" style={{ color: "var(--fg-3)" }}>
                                (可选)
                            </span>
                        </Label>
                        <Input placeholder="11 位手机号" autoComplete="tel" inputMode="numeric" maxLength={11} />
                        {phoneError ? <FieldError>{phoneError}</FieldError> : null}
                    </TextField>
                </div>

                <div className="relative mb-5">
                    <TextField
                        fullWidth
                        name="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={onPasswordChange}
                        isInvalid={Boolean(passwordError)}
                        validationBehavior="aria"
                    >
                        <Label>密码</Label>
                        <Input
                            className="pr-11"
                            placeholder="至少 6 位"
                            autoComplete="new-password"
                            onFocus={onPasswordFocus}
                            onBlur={onPasswordBlur}
                        />
                        {passwordError ? <FieldError>{passwordError}</FieldError> : null}
                    </TextField>
                    <div className="absolute right-2" style={{ top: "2.15rem" }}>
                        <PasswordEye visible={showPassword} onToggle={onToggleShowPassword} />
                    </div>
                </div>

                <div className="relative mb-5">
                    <TextField
                        fullWidth
                        name="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={onConfirmPasswordChange}
                        isInvalid={Boolean(confirmError)}
                        validationBehavior="aria"
                    >
                        <Label>确认密码</Label>
                        <Input
                            className="pr-11"
                            placeholder="再次输入密码"
                            autoComplete="new-password"
                            onFocus={onPasswordFocus}
                            onBlur={onPasswordBlur}
                        />
                        {confirmError ? <FieldError>{confirmError}</FieldError> : null}
                    </TextField>
                    <div className="absolute right-2" style={{ top: "2.15rem" }}>
                        <PasswordEye visible={showConfirmPassword} onToggle={onToggleShowConfirmPassword} />
                    </div>
                </div>

                <div className="mb-6">
                    <AuthCheckbox
                        name="terms"
                        isSelected={agreeTerms}
                        onChange={onAgreeTermsChange}
                        isInvalid={Boolean(termsError)}
                    >
                        <span className="text-sm">我同意服务条款</span>
                    </AuthCheckbox>
                    {termsError ? (
                        <p className="mt-1 text-xs" style={{ color: "var(--error)" }}>
                            {termsError}
                        </p>
                    ) : null}
                </div>

                {errorMsg ? (
                    <Alert status="danger" className="mb-4">
                        <Alert.Indicator />
                        <Alert.Content>
                            <Alert.Description>{errorMsg}</Alert.Description>
                        </Alert.Content>
                    </Alert>
                ) : null}

                <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    fullWidth
                    isDisabled={isSubmitting}
                    className="rounded-full font-semibold"
                >
                    {isSubmitting ? "创建中…" : "注册"}
                </Button>
            </form>

            <p className="mt-8 text-center text-sm" style={{ color: "var(--fg-3)" }}>
                已有账号？{" "}
                <Link
                    href={`${AUTH_BASE}/login`}
                    className="no-underline hover:underline"
                    style={{ color: "var(--fg)", fontWeight: 600 }}
                >
                    登录
                </Link>
            </p>
        </div>
    );
}
