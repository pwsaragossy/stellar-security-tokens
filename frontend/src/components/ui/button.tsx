
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/**
 * Premium Button Component
 * Following the frontend-design workflow for distinctive, production-grade UX
 * 
 * Key improvements:
 * - All variants have visible borders/outlines
 * - Clear hover, focus, and active (pressed) states
 * - Smooth transitions with subtle scale animation on press
 * - Gold accent ring on focus for premium feel
 */
const buttonVariants = cva(
    // Base styles with enhanced transitions and focus ring
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(43_45%_55%)] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(222.2_84%_4.9%)] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.97] active:transition-none",
    {
        variants: {
            variant: {
                // Primary - Solid with glow effect
                default:
                    "bg-primary text-primary-foreground border border-primary/50 shadow-md shadow-primary/25 hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/30 hover:border-primary/70 active:shadow-sm",

                // Destructive - Red with subtle border
                destructive:
                    "bg-destructive text-destructive-foreground border border-destructive/50 shadow-md shadow-destructive/25 hover:bg-destructive/90 hover:shadow-lg hover:shadow-destructive/30 active:shadow-sm",

                // Outline - Clear visible border that highlights on hover
                outline:
                    "border-2 border-white/20 bg-white/5 text-foreground shadow-sm hover:bg-white/10 hover:border-[hsl(43_45%_55%)/0.5] hover:text-[hsl(43_45%_55%)] hover:shadow-md hover:shadow-[hsl(43_45%_55%)/0.1] active:bg-white/15 active:border-[hsl(43_45%_55%)/0.7]",

                // Secondary - Subtle but visible
                secondary:
                    "bg-secondary text-secondary-foreground border border-secondary/50 shadow-sm hover:bg-secondary/80 hover:border-secondary/70 active:bg-secondary/70",

                // Ghost - Now has visible border on hover/active for better UX
                ghost:
                    "border border-transparent text-muted-foreground hover:bg-white/10 hover:border-white/20 hover:text-foreground active:bg-white/15 active:border-white/30",

                // Link - Underline effect
                link: "text-primary underline-offset-4 hover:underline hover:text-primary/80 active:text-primary/70",

                // Success - Green variant for positive actions
                success:
                    "bg-[hsl(160_60%_40%)] text-white border border-[hsl(160_60%_40%)]/50 shadow-md shadow-[hsl(160_60%_40%)]/25 hover:bg-[hsl(160_60%_35%)] hover:shadow-lg hover:shadow-[hsl(160_60%_40%)]/30 active:shadow-sm",

                // Accent - Gold/premium variant
                accent:
                    "bg-[hsl(43_45%_55%)] text-[hsl(220_60%_8%)] border border-[hsl(43_45%_55%)]/50 shadow-md shadow-[hsl(43_45%_55%)]/25 hover:bg-[hsl(43_50%_60%)] hover:shadow-lg hover:shadow-[hsl(43_45%_55%)]/30 font-bold active:shadow-sm",
            },
            size: {
                default: "h-10 px-5 py-2.5",
                sm: "h-8 rounded-md px-3.5 text-xs",
                lg: "h-12 rounded-lg px-8 text-base",
                icon: "h-10 w-10",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        return (
            <button
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button, buttonVariants }
