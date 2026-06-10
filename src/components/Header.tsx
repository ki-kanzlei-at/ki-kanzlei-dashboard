"use client";

import { usePathname } from "next/navigation";
import { Bell, ChevronRight } from "lucide-react";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
    Breadcrumb, BreadcrumbItem, BreadcrumbLink,
    BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription,
} from "@/components/ui/empty";
import { CreditsBadge } from "@/components/CreditsBadge";

/* ── Route meta ── */
const routeMeta: Record<string, { label: string; parent?: string }> = {
    "/dashboard":                  { label: "Dashboard" },
    "/dashboard/inbox":            { label: "Inbox",         parent: "Dashboard" },
    "/dashboard/leads":            { label: "Leads",         parent: "Dashboard" },
    "/dashboard/ai-researcher":    { label: "AI Researcher", parent: "Dashboard" },
    "/dashboard/campaigns":        { label: "E-Mail-Kampagnen", parent: "Dashboard" },
    "/dashboard/campaigns/new":    { label: "Neue Kampagne", parent: "Dashboard" },
    "/dashboard/linkedin":         { label: "LinkedIn",      parent: "Dashboard" },
    "/dashboard/social-media":     { label: "Social Media",  parent: "Dashboard" },
    "/dashboard/seo":              { label: "SEO",           parent: "Dashboard" },
    "/dashboard/settings":         { label: "Einstellungen", parent: "Dashboard" },
};

/** Meta für dynamische Routen (z. B. Kampagnen-Detail) ableiten. */
function resolveRouteMeta(pathname: string): { label: string; parent?: string } | undefined {
    const exact = routeMeta[pathname];
    if (exact) return exact;
    if (/^\/dashboard\/campaigns\/[^/]+$/.test(pathname)) {
        return { label: "Kampagnen-Details", parent: "E-Mail-Kampagnen" };
    }
    return undefined;
}

function NotificationDropdown() {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-foreground/55 hover:text-foreground"
                >
                    <Bell className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
                align="end"
                sideOffset={8}
                className="w-72 p-0 shadow-xl overflow-hidden"
            >
                <DropdownMenuLabel className="px-4 py-3 border-b border-border/50 text-sm font-bold">
                    Benachrichtigungen
                </DropdownMenuLabel>
                <Empty className="py-8 px-4 border-0 gap-3">
                    <EmptyHeader>
                        <EmptyMedia variant="icon" className="size-8 [&_svg:not([class*='size-'])]:size-4">
                            <Bell />
                        </EmptyMedia>
                        <EmptyTitle className="text-sm">Keine Benachrichtigungen</EmptyTitle>
                        <EmptyDescription className="text-xs">
                            Du bist auf dem neuesten Stand.
                        </EmptyDescription>
                    </EmptyHeader>
                </Empty>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/* ── Header ── */
export function Header() {
    const pathname = usePathname();
    const meta = resolveRouteMeta(pathname);

    return (
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/50 bg-background px-4 sticky top-0 z-40">
            <div className="flex items-center gap-2 flex-1 min-w-0">
                <SidebarTrigger className="-ml-1" />

                <Separator orientation="vertical" className="h-4" />

                {meta && (
                    <Breadcrumb>
                        <BreadcrumbList>
                            {meta.parent && (
                                <>
                                    <BreadcrumbItem className="hidden md:block">
                                        <BreadcrumbLink href="/dashboard" className="text-sm">
                                            {meta.parent}
                                        </BreadcrumbLink>
                                    </BreadcrumbItem>
                                    <BreadcrumbSeparator className="hidden md:block">
                                        <ChevronRight className="h-3.5 w-3.5" />
                                    </BreadcrumbSeparator>
                                </>
                            )}
                            <BreadcrumbItem>
                                <BreadcrumbPage className="text-sm font-semibold">
                                    {meta.label}
                                </BreadcrumbPage>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                )}
            </div>

            <div className="flex items-center gap-1">
                <CreditsBadge />
                <NotificationDropdown />
            </div>
        </header>
    );
}
