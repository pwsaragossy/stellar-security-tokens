import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface InfoTooltipProps {
    content: string | React.ReactNode;
    variant?: "inline" | "button";
    side?: "top" | "right" | "bottom" | "left";
    maxWidth?: string;
    className?: string;
    children?: React.ReactNode;
}

/**
 * InfoTooltip - Contextual help component
 * 
 * Provides accessible, responsive tooltips for explaining features inline.
 * 
 * @param content - The help text or React node to display in the tooltip
 * @param variant - "inline" (ⓘ icon next to content) or "button" (standalone icon button)
 * @param side - Preferred side for tooltip placement
 * @param maxWidth - CSS max-width for tooltip content (default: 320px)
 * @param className - Additional classes for the trigger element
 * @param children - Content to wrap (for inline variant)
 */
export function InfoTooltip({
    content,
    variant = "button",
    side = "top",
    maxWidth = "320px",
    className,
    children,
}: InfoTooltipProps) {
    return (
        <TooltipPrimitive.Provider delayDuration={200}>
            <TooltipPrimitive.Root>
                <TooltipPrimitive.Trigger asChild>
                    {variant === "inline" ? (
                        <span className={cn("inline-flex items-center gap-1.5", className)}>
                            {children}
                            <button
                                type="button"
                                className="inline-flex items-center justify-center w-4 h-4 text-blue-400 hover:text-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 rounded-full transition-colors"
                                aria-label="More information"
                            >
                                <Info className="w-4 h-4" />
                            </button>
                        </span>
                    ) : (
                        <button
                            type="button"
                            className={cn(
                                "inline-flex items-center justify-center w-5 h-5 text-slate-400 hover:text-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 rounded-full transition-colors",
                                className
                            )}
                            aria-label="More information"
                        >
                            <Info className="w-4 h-4" />
                        </button>
                    )}
                </TooltipPrimitive.Trigger>
                <TooltipPrimitive.Portal>
                    <TooltipPrimitive.Content
                        side={side}
                        sideOffset={5}
                        className={cn(
                            "z-50 overflow-hidden rounded-lg bg-slate-800 border border-white/10 px-4 py-3 text-sm text-slate-200 shadow-xl",
                            "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
                            "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
                        )}
                        style={{ maxWidth }}
                    >
                        <div className="space-y-2">
                            {typeof content === "string" ? (
                                <p className="leading-relaxed whitespace-pre-line">{content}</p>
                            ) : (
                                content
                            )}
                        </div>
                        <TooltipPrimitive.Arrow className="fill-slate-800" />
                    </TooltipPrimitive.Content>
                </TooltipPrimitive.Portal>
            </TooltipPrimitive.Root>
        </TooltipPrimitive.Provider>
    );
}
