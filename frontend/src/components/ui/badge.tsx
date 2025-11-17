import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "success" | "warning" | "danger" | "info" | "secondary";
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
          {
            "bg-primary/10 text-primary": variant === "default",
            "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200": variant === "success",
            "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200": variant === "warning",
            "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200": variant === "danger",
            "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200": variant === "info",
            "bg-secondary text-secondary-foreground": variant === "secondary",
          },
          className
        )}
        {...props}
      />
    )
  }
)
Badge.displayName = "Badge"

export { Badge }

