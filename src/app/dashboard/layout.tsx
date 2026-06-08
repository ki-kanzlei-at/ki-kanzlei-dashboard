import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserProfile } from "@/lib/supabase/profiles";
import { getUserSettings } from "@/lib/supabase/settings";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Header } from "@/components/Header";

export default async function DashboardLayout({
    children,
    modal,
}: {
    children: React.ReactNode;
    modal: React.ReactNode;
}) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login");
    }

    const [profile, settings, cookieStore] = await Promise.all([
        getUserProfile(user.id),
        getUserSettings(user.id),
        cookies(),
    ]);

    const role = profile?.role ?? "user";
    const avatarUrl = (settings?.brand_settings as { avatar_url?: string } | null)?.avatar_url ?? null;

    const sidebarUser = {
        email: user.email ?? "",
        name: profile?.display_name
            ?? (user.user_metadata?.full_name as string | null)
            ?? (user.user_metadata?.name as string | null)
            ?? null,
        avatarUrl,
    };

    const sidebarCookie = cookieStore.get("sidebar_state");
    const defaultOpen = sidebarCookie ? sidebarCookie.value === "true" : true;

    return (
        <SidebarProvider defaultOpen={defaultOpen}>
            <AppSidebar user={sidebarUser} role={role} />
            <SidebarInset className="bg-background">
                <Header />
                <div className="flex flex-1 flex-col">
                    <main className="@container/main flex flex-1 flex-col overflow-y-auto">
                        {children}
                    </main>
                </div>
            </SidebarInset>
            {modal}
        </SidebarProvider>
    );
}
