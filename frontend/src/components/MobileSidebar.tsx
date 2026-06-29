import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MobileSidebarProps {
    children: React.ReactNode;
    isOpen: boolean;
    onClose: () => void;
}

/**
 * Mobile sidebar overlay component.
 * Renders children inside a slide-in panel on mobile devices.
 */
export function MobileSidebar({ children, isOpen, onClose }: MobileSidebarProps) {
    return (
        <>
            {/* Backdrop */}
            <div
                className={cn(
                    "fixed inset-0 bg-black/60 z-40 md:hidden transition-opacity duration-300",
                    isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
                )}
                onClick={onClose}
            />

            {/* Sidebar Panel */}
            <aside
                className={cn(
                    "fixed left-0 top-0 h-full w-72 bg-slate-950 border-r border-white/10 z-50 md:hidden flex flex-col transform transition-transform duration-300 ease-out",
                    isOpen ? "translate-x-0" : "-translate-x-full"
                )}
            >
                {/* Close Button */}
                <div className="absolute right-2 top-3">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className="text-muted-foreground hover:text-white"
                    >
                        <X className="w-5 h-5" />
                    </Button>
                </div>
                {children}
            </aside>
        </>
    );
}

interface MenuToggleButtonProps {
    onClick: () => void;
    className?: string;
}

/**
 * Hamburger menu button for mobile sidebar toggle.
 * Only visible on mobile (md:hidden).
 */
export function MenuToggleButton({ onClick, className }: MenuToggleButtonProps) {
    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={onClick}
            className={cn("md:hidden text-muted-foreground hover:text-white", className)}
        >
            <Menu className="w-5 h-5" />
        </Button>
    );
}

/**
 * Custom hook for managing mobile sidebar state.
 */
export function useMobileSidebar() {
    const [isOpen, setIsOpen] = useState(false);

    const open = () => setIsOpen(true);
    const close = () => setIsOpen(false);
    const toggle = () => setIsOpen(prev => !prev);

    return { isOpen, open, close, toggle };
}
