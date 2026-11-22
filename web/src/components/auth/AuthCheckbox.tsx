"use client";

import { Checkbox } from "@heroui/react";
import type { ReactNode } from "react";

interface AuthCheckboxProps {
    name?: string;
    isSelected: boolean;
    onChange: (value: boolean) => void;
    children: ReactNode;
    isInvalid?: boolean;
}

/** HeroUI v3 Checkbox 复合结构封装 */
export function AuthCheckbox({ name, isSelected, onChange, children, isInvalid }: AuthCheckboxProps) {
    return (
        <Checkbox name={name} isSelected={isSelected} onChange={onChange} isInvalid={isInvalid}>
            <Checkbox.Content>
                <Checkbox.Control>
                    <Checkbox.Indicator />
                </Checkbox.Control>
                {children}
            </Checkbox.Content>
        </Checkbox>
    );
}
