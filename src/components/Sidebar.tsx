"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Users,
    Mail,
    Share2,
    Linkedin,
    Settings,
    ChevronRight,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const mainNav = [
    { name: "Übersicht",      href: "/dashboard",                icon: LayoutDashboard },
    { name: "Leads Scraping", href: "/dashboard/leads",          icon: Users },
    { name: "Email Outreach", href: "/dashboard/email-outreach", icon: Mail },
    { name: "Social Media",   href: "/dashboard/social-media",   icon: Share2 },
    { name: "LinkedIn",       href: "/dashboard/linkedin",       icon: Linkedin },
];

interface NavItemProps {
    href: string;
    icon: React.ElementType;
    name: string;
    isActive: boolean;
    badge?: string;
}

function NavItem({ href, icon: Icon, name, isActive, badge }: NavItemProps) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Link
                    href={href}
                    className={cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                        isActive
                            ? "bg-primary/10 text-primary"
                            : "text-foreground/65 hover:bg-black/5 hover:text-foreground"
                    )}
                >
                    {/* Active indicator bar */}
                    {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r-full" />
                    )}

                    <Icon
                        className={cn(
                            "h-4 w-4 flex-shrink-0 transition-colors",
                            isActive
                                ? "text-primary"
                                : "text-foreground/40 group-hover:text-foreground/70"
                        )}
                    />

                    <span className="flex-1 truncate">{name}</span>

                    {badge && (
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-semibold">
                            {badge}
                        </Badge>
                    )}

                    {isActive && (
                        <ChevronRight className="h-3.5 w-3.5 opacity-50" />
                    )}
                </Link>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
                {name}
            </TooltipContent>
        </Tooltip>
    );
}

export function Sidebar() {
    const pathname = usePathname();

    return (
        <aside
            className="w-64 flex flex-col h-screen sticky top-0 border-r border-white/40 flex-shrink-0"
            style={{
                background: "rgba(255,255,255,0.58)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
            }}
        >
            {/* ── Logo ── */}
            <div className="h-14 flex items-center px-5 border-b border-white/40 flex-shrink-0">
                <Link href="/dashboard">
                    <Image
                        src="/KI-Kanzlei_Logo_2026.png"
                        alt="KI Kanzlei"
                        width={108}
                        height={28}
                        className="object-contain h-7 w-auto"
                        priority
                    />
                </Link>
            </div>

            {/* ── Navigation ── */}
            <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
                <p className="mb-2 mt-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-foreground/35">
                    Module
                </p>

                {mainNav.map((item) => (
                    <NavItem
                        key={item.href}
                        href={item.href}
                        icon={item.icon}
                        name={item.name}
                        isActive={pathname === item.href}
                    />
                ))}

                <div className="py-3">
                    <Separator className="bg-black/6" />
                </div>

                <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-foreground/35">
                    System
                </p>

                <NavItem
                    href="/dashboard/settings"
                    icon={Settings}
                    name="Einstellungen"
                    isActive={pathname === "/dashboard/settings"}
                />
            </nav>

        </aside>
    );
}
