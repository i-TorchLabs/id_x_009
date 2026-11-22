"use client";

import Link from "next/link";
import { FormEvent } from "react";
import { Alert, Button, FieldError, Input, Label, TextField } from "@heroui/react";
import { AuthCheckbox } from "@/components/auth/AuthCheckbox";
import { AuthLogo } from "@/components/auth/AuthLogo";
import { PasswordEye } from "@/components/auth/PasswordEye";
import { AUTH_BASE, AUTH_COPY } from "@/components/auth/constants";

export interface LoginFormProps {
    email: string;
    password: string;
    remember: boolean;
    showPassword: boolean;
    isSubmitting: boolean;
    errorMsg: string;
    emailError: string;
    passwordError: string;
    registeredHint: boolean;
    onEmailChange: (value: string) => void;
    onPasswordChange: (value: string) => void;
    onRememberChange: (value: boolean) => void;
    onToggleShowPassword: () => void;
    onEmailFocus: () => void;
    onEmailBlur: () => void;
    onPasswordFocus: () => void;
    onPasswordBlur: () => void;
    onSubmit: (e: FormEvent) => void;
}

export default function LoginForm({
    email,
    password,
    remember,
    showPassword,
    isSubmitting,
    errorMsg,
    emailError,
    passwordError,
    registeredHint,
    onEmailChange,
    onPasswordChange,
    onRememberChange,
    onToggleShowPassword,
    onEmailFocus,
    onEmailBlur,
    onPasswordFocus,
    onPasswordBlur,
    onSubmit,
}: LoginFormProps) {
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
                    {AUTH_COPY.loginTitle}
                </h1>
                <p className="mt-1.5 text-sm" style={{ color: "var(--fg-3)" }}>
                    {AUTH_COPY.loginSubtitle}
                </p>
                {registeredHint ? (
                    <p className="mt-3 text-sm" style={{ color: "var(--fg-2)" }} role="status">
                        注册成功，请登录
                    </p>
                ) : null}
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
                            autoComplete="current-password"
                            onFocus={onPasswordFocus}
                            onBlur={onPasswordBlur}
                        />
                        {passwordError ? <FieldError>{passwordError}</FieldError> : null}
                    </TextField>
                    <div className="absolute right-2" style={{ top: "2.15rem" }}>
                        <PasswordEye visible={showPassword} onToggle={onToggleShowPassword} />
                    </div>
                </div>

                <div className="mb-6 flex items-center justify-between gap-3">
                    <AuthCheckbox name="remember" isSelected={remember} onChange={onRememberChange}>
                        <span className="text-sm">记住我</span>
                    </AuthCheckbox>
                    <Link
                        href={`${AUTH_BASE}/forgot-password`}
                        className="text-sm no-underline hover:underline"
                        style={{ color: "var(--fg)", fontWeight: 500 }}
                    >
                        忘记密码？
                    </Link>
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
                    {isSubmitting ? "登录中…" : "登录"}
                </Button>
            </form>

            <p className="mt-8 text-center text-sm" style={{ color: "var(--fg-3)" }}>
                没有账号？{" "}
                <Link
                    href={`${AUTH_BASE}/register`}
                    className="no-underline hover:underline"
                    style={{ color: "var(--fg)", fontWeight: 600 }}
                >
                    注册
                </Link>
            </p>
        </div>
    );
}
