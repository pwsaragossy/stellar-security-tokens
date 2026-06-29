
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "@/lib/utils"

/**
 * Premium Button Component
 *
 * Key improvements:
 * - All variants have visible borders/outlines
 * - Clear hover, focus, and active (pressed) states
 * - Lime signal ring on focus (Signal design system)
 *
 * Colours come from the Signal design tokens (index.css @theme → bg-primary,
 * text-foreground, etc. are live as of the @theme bridge). Primary = lime CTA.
 */
const buttonVariants = cva(
    // Base styles with enhanced transitions and focus ring
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(76_86%_63%)] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(222.2_84%_4.9%)] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.97] active:transition-none",
    {
        variants: {
            variant: {
                // Primary - solid lime signal CTA (flat, no glow)
                default:
                    "bg-primary text-primary-foreground border border-primary hover:bg-primary/90 active:bg-primary/80",

                // Destructive - Red with subtle border
                destructive:
                    "bg-destructive text-destructive-foreground border border-destructive/50 hover:bg-destructive/90 active:opacity-90",

                // Outline - Clear visible border that highlights on hover
                outline:
                    "border-2 border-white/20 bg-white/5 text-foreground shadow-sm hover:bg-white/10 hover:border-[hsl(76_86%_63%)/0.5] hover:text-[hsl(76_86%_63%)] hover:shadow-md hover:shadow-[hsl(76_86%_63%)/0.1] active:bg-white/15 active:border-[hsl(76_86%_63%)/0.7]",

                // Secondary - Subtle but visible
                secondary:
                    "bg-secondary text-secondary-foreground border border-border hover:bg-secondary/80 active:bg-secondary/70",

                // Ghost - Now has visible border on hover/active for better UX
                ghost:
                    "border border-transparent text-muted-foreground hover:bg-white/10 hover:border-white/20 hover:text-white active:bg-white/15 active:border-white/30",

                // Link - Underline effect
                link: "text-primary underline-offset-4 hover:underline hover:text-primary/80 active:text-primary/70",

                // Success - Green variant for positive actions
                success:
                    "bg-[hsl(160_60%_40%)] text-white border border-[hsl(160_60%_40%)]/50 shadow-md shadow-[hsl(160_60%_40%)]/25 hover:bg-[hsl(160_60%_35%)] hover:shadow-lg hover:shadow-[hsl(160_60%_40%)]/30 active:shadow-sm",

                // Accent - lime signal emphasis variant
                accent:
                    "bg-[hsl(76_86%_63%)] text-[hsl(220_10%_6%)] border border-[hsl(76_86%_63%)]/50 shadow-md shadow-[hsl(76_86%_63%)]/25 hover:bg-[hsl(76_88%_68%)] hover:shadow-lg hover:shadow-[hsl(76_86%_63%)]/30 font-bold active:shadow-sm",
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
        const Comp = asChild ? Slot : "button"
        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button, buttonVariants }
