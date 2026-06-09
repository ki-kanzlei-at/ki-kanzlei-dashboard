"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
    LayoutDashboard, Users, Send, Share2, Linkedin,
    Settings, ChevronsUpDown,
    LogOut, BadgeCheck, Loader2,
    Inbox, MessageCircle, BookOpen, ExternalLink,
} from "lucide-react";

/** Doku/Guides-Link (Platzhalter — bei eigener Doku-Seite hier ändern). */
const DOCS_URL = "https://www.ki-kanzlei.at";
import { useState, useEffect } from "react";

import {
    Sidebar, SidebarContent, SidebarFooter,
    SidebarGroup, SidebarGroupContent,
    SidebarHeader, SidebarMenu,
    SidebarMenuButton, SidebarMenuItem, SidebarRail,
} from "@/components/ui/sidebar";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuGroup,
    DropdownMenuItem, DropdownMenuLabel,
    DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";

/* ── Navigation data ──
   pip = kleine farbige Bubble (primary, weiße Schrift), count = dezenter grauer Zähler */
type NavItem = {
    name: string;
    href: string;
    icon: typeof LayoutDashboard;
    disabled?: boolean;
    /** Statische Vorbau-Pip (für noch nicht implementierte Module) */
    pip?: number;
    /** Statischer Count-Hinweis */
    count?: number | string;
    /** Dynamische Lead-Count-Anbindung */
    isLeadsCount?: boolean;
    /** Dynamische LinkedIn-Lead-Count-Anbindung */
    isLinkedInCount?: boolean;
};
/* MVP-Navigation — 1:1 aus dem Claude-Design (Inbox.html · Sidebar):
   Übersicht · CRM · Kanäle · Setup */
const sections: { label: string; items: NavItem[] }[] = [
    {
        label: "Übersicht",
        items: [
            { name: "Dashboard", href: "/dashboard",       icon: LayoutDashboard },
            { name: "Inbox",     href: "/dashboard/inbox", icon: Inbox },
        ],
    },
    {
        label: "CRM",
        items: [
            { name: "Leads",         href: "/dashboard/leads",         icon: Users,        isLeadsCount: true },
            { name: "AI Researcher", href: "/dashboard/ai-researcher", icon: MessageCircle },
        ],
    },
    {
        label: "Kanäle",
        items: [
            { name: "E-Mail-Kampagnen", href: "/dashboard/campaigns",    icon: Send },
            { name: "LinkedIn",         href: "/dashboard/linkedin",     icon: Linkedin, isLinkedInCount: true },
            { name: "Social Media",     href: "/dashboard/social-media", icon: Share2 },
        ],
    },
    {
        label: "Setup",
        items: [
            { name: "Einstellungen", href: "/dashboard/settings", icon: Settings },
        ],
    },
];

/* ── Helpers ── */
function getInitials(name: string | null | undefined, email: string): string {
    if (name && name.trim()) {
        const parts = name.trim().split(" ");
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return parts[0][0].toUpperCase();
    }
    return email[0].toUpperCase();
}

function getDisplayName(name: string | null | undefined, email: string): string {
    if (name && name.trim()) return name.trim().split(" ")[0];
    return email.split("@")[0];
}

function isActive(pathname: string, href: string): boolean {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
}

/* ── Props ── */
interface AppSidebarProps {
    user: {
        email: string;
        name?: string | null;
        avatarUrl?: string | null;
    };
    role?: "admin" | "user";
}

/* ── App Sidebar ── */
export function AppSidebar({ user, role = "user" }: AppSidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const [loggingOut, setLoggingOut] = useState(false);

    const initials = getInitials(user.name, user.email);
    const displayName = getDisplayName(user.name, user.email);

    // Dynamische Lead-Count (kein UI-Block wenn fetch fehlschlägt)
    const [leadsCount, setLeadsCount] = useState<number | null>(null);
    const [linkedinCount, setLinkedinCount] = useState<number | null>(null);
    useEffect(() => {
        let cancelled = false;
        fetch("/api/leads?limit=1&page=1")
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => { if (!cancelled && j?.count != null) setLeadsCount(j.count); })
            .catch(() => {});
        fetch("/api/linkedin/stats")
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => { if (!cancelled && j?.data?.total != null) setLinkedinCount(j.data.total); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [pathname]);

    async function handleLogout() {
        setLoggingOut(true);
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/login");
        router.refresh();
    }

    return (
        <Sidebar
            collapsible="icon"
            className="border-r border-sidebar-border bg-sidebar"
        >
            {/* ── Header / Logo ── */}
            <SidebarHeader className="border-b border-sidebar-border">
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            size="lg"
                            asChild
                            className="hover:bg-transparent active:bg-transparent"
                        >
                            <Link href="/dashboard" className="flex items-center gap-2.5">
                                <div className="h-7 w-7 rounded-md bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 overflow-hidden">
                                    <Image
                                        src="/KI-Kanzlei_Logo_2026.png"
                                        alt="KI Kanzlei"
                                        width={128}
                                        height={128}
                                        quality={100}
                                        className="h-7 w-7 object-cover"
                                        priority
                                    />
                                </div>
                                <div className="group-data-[collapsible=icon]:hidden leading-tight">
                                    <span className="text-[13.5px] font-semibold text-sidebar-foreground tracking-tight">
                                        KI Kanzlei
                                    </span>
                                    <p className="text-[11px] text-muted-foreground font-normal">
                                        Outreach Plattform
                                    </p>
                                </div>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            {/* ── Content ── */}
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {sections.flatMap((s) => s.items).map((item) => {
                                    const { name, href, icon: Icon, disabled, pip, count, isLeadsCount, isLinkedInCount } = item;
                                    const active = isActive(pathname, href);
                                    const displayCount = isLeadsCount
                                        ? (leadsCount != null ? leadsCount.toLocaleString("de-DE") : undefined)
                                        : isLinkedInCount
                                            ? (linkedinCount != null ? linkedinCount.toLocaleString("de-DE") : undefined)
                                            : count != null
                                                ? typeof count === "number" ? count.toLocaleString("de-DE") : count
                                                : undefined;
                                    return (
                                        <SidebarMenuItem key={href}>
                                            <SidebarMenuButton
                                                asChild={!disabled}
                                                isActive={active}
                                                tooltip={name}
                                                disabled={disabled}
                                                className="text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:font-medium aria-disabled:opacity-50 aria-disabled:cursor-not-allowed [&_svg]:size-[15px]"
                                            >
                                                {disabled ? (
                                                    <span aria-disabled="true" className="flex items-center gap-2 w-full overflow-hidden">
                                                        <Icon className="shrink-0" />
                                                        <span className="flex-1 truncate">{name}</span>
                                                        {pip != null && (
                                                            <span className="group-data-[collapsible=icon]:hidden ml-auto mr-1 inline-grid place-items-center min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-medium">
                                                                {pip}
                                                            </span>
                                                        )}
                                                        {displayCount != null && (
                                                            <span className="group-data-[collapsible=icon]:hidden ml-auto mr-1 text-[11px] text-muted-foreground tabular-nums">
                                                                {displayCount}
                                                            </span>
                                                        )}
                                                    </span>
                                                ) : (
                                                    <Link href={href} className="flex items-center gap-2 w-full overflow-hidden">
                                                        <Icon className="shrink-0" />
                                                        <span className="flex-1 truncate">{name}</span>
                                                        {pip != null && (
                                                            <span className="group-data-[collapsible=icon]:hidden ml-auto mr-1 inline-grid place-items-center min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-medium">
                                                                {pip}
                                                            </span>
                                                        )}
                                                        {displayCount != null && (
                                                            <span className={`group-data-[collapsible=icon]:hidden ml-auto mr-1 text-[11px] tabular-nums ${active ? "text-sidebar-accent-foreground/80" : "text-muted-foreground"}`}>
                                                                {displayCount}
                                                            </span>
                                                        )}
                                                    </Link>
                                                )}
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    );
                            })}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>

            {/* ── Footer / User ── */}
            <SidebarFooter className="border-t border-sidebar-border">
                {/* Hilfe-/Guides-Badge über dem Profil (im Icon-Modus ausgeblendet) */}
                <a
                    href={DOCS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group-data-[collapsible=icon]:hidden mx-1 mb-1 block rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3 transition-colors hover:bg-sidebar-accent/70"
                >
                    <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-primary shrink-0" strokeWidth={1.75} />
                        <span className="text-[12px] font-medium text-sidebar-foreground">Anleitungen & Guides</span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground leading-snug">
                        Setup-Tipps & How-tos von unseren Experten.
                    </p>
                    <span className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-medium text-primary">
                        Dokumentation öffnen <ExternalLink className="h-3 w-3" />
                    </span>
                </a>

                <SidebarMenu>
                    <SidebarMenuItem>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <SidebarMenuButton
                                    size="lg"
                                    className="text-sidebar-foreground hover:bg-sidebar-accent/60 data-[state=open]:bg-sidebar-accent/60"
                                    tooltip="Mein Konto"
                                >
                                    <Avatar className="h-7 w-7 flex-shrink-0 rounded-md">
                                        {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={displayName} className="object-cover" />}
                                        <AvatarFallback className="bg-primary text-primary-foreground font-medium text-[10.5px] rounded-md">
                                            {initials}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="grid flex-1 text-left leading-tight">
                                        <span className="truncate text-[12.5px] font-medium text-sidebar-foreground">{displayName}</span>
                                        <span className="truncate text-[11px] text-muted-foreground font-normal">{user.email}</span>
                                    </div>
                                    <ChevronsUpDown className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                                </SidebarMenuButton>
                            </DropdownMenuTrigger>

                            <DropdownMenuContent
                                side="top"
                                align="end"
                                sideOffset={8}
                                className="w-60 p-0 shadow-xl overflow-hidden"
                            >
                                {/* User info */}
                                <DropdownMenuLabel className="px-4 py-3.5 border-b border-border/50">
                                    <div className="flex items-center gap-3">
                                        <Avatar className="h-9 w-9 flex-shrink-0 rounded-xl">
                                            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={displayName} className="object-cover" />}
                                            <AvatarFallback className="bg-primary text-primary-foreground font-bold rounded-xl">
                                                {initials}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-foreground">{displayName}</p>
                                            <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                                            <Badge variant="secondary" className="mt-1 text-[9px] font-semibold uppercase tracking-wide">
                                                {role === "admin" ? "Administrator" : "Benutzer"}
                                            </Badge>
                                        </div>
                                    </div>
                                </DropdownMenuLabel>

                                <DropdownMenuGroup className="py-1.5">
                                    <DropdownMenuItem asChild className="mx-1.5 gap-3 cursor-pointer">
                                        <Link href="/dashboard/settings?tab=profile">
                                            <BadgeCheck className="h-4 w-4 text-muted-foreground" />
                                            Mein Profil
                                        </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild className="mx-1.5 gap-3 cursor-pointer">
                                        <Link href="/dashboard/settings">
                                            <Settings className="h-4 w-4 text-muted-foreground" />
                                            Einstellungen
                                        </Link>
                                    </DropdownMenuItem>
                                </DropdownMenuGroup>

                                <DropdownMenuSeparator />

                                <DropdownMenuGroup className="py-1.5">
                                    <DropdownMenuItem
                                        variant="destructive"
                                        className="mx-1.5 gap-3 cursor-pointer"
                                        onSelect={handleLogout}
                                        disabled={loggingOut}
                                    >
                                        {loggingOut
                                            ? <Loader2 className="h-4 w-4 animate-spin" />
                                            : <LogOut className="h-4 w-4" />
                                        }
                                        {loggingOut ? "Abmelden…" : "Abmelden"}
                                    </DropdownMenuItem>
                                </DropdownMenuGroup>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>

            <SidebarRail />
        </Sidebar>
    );
}
