"use client";

import { ColumnDef } from "@tanstack/react-table";
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Mail,
  Phone as PhoneIcon,
  ExternalLink,
  MapPin,
} from "lucide-react";
import { CompanyFavicon } from "./CompanyFavicon";
import {
  BrandLinkedIn,
  BrandFacebook,
  BrandInstagram,
  BrandX,
  BrandYouTube,
  BrandTikTok,
} from "./BrandIcons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTableColumnHeader } from "./DataTableColumnHeader";
import type { Lead, LeadStatus } from "@/types/leads";
import { countryLabel } from "@/types/leads";

/* ── Status config — KI Kanzlei Brand-Palette (badge-status) ── */
export const LEAD_STATUS_CONFIG: Record<
  LeadStatus,
  { label: string; className: string; dot: string }
> = {
  new:              { label: "Neu",            className: "status-new",            dot: "bg-sky-500" },
  contacted:        { label: "Kontaktiert",    className: "status-contacted",      dot: "bg-blue-500" },
  interested:       { label: "Interessiert",   className: "status-interested",     dot: "bg-primary" },
  not_interested:   { label: "Kein Interesse", className: "status-not_interested", dot: "bg-muted-foreground/50" },
  converted:        { label: "Konvertiert",    className: "status-converted",      dot: "bg-indigo-600" },
};

const STATUS_LIST: { value: LeadStatus; label: string; dot: string }[] = [
  { value: "new",            label: "Neu",            dot: "bg-sky-500" },
  { value: "contacted",      label: "Kontaktiert",    dot: "bg-blue-500" },
  { value: "interested",     label: "Interessiert",   dot: "bg-primary" },
  { value: "converted",      label: "Konvertiert",    dot: "bg-indigo-600" },
  { value: "not_interested", label: "Kein Interesse", dot: "bg-muted-foreground/50" },
];

/* ── Social Icons sub-component ── */
function SocialIcons({ lead }: { lead: Lead }) {
  const socials = [
    { url: lead.social_linkedin,  label: "LinkedIn",  Icon: BrandLinkedIn,  color: "text-[#0A66C2]" },
    { url: lead.social_facebook,  label: "Facebook",  Icon: BrandFacebook,  color: "text-[#1877F2]" },
    { url: lead.social_instagram, label: "Instagram", Icon: BrandInstagram, color: "text-[#E4405F]" },
    { url: lead.social_twitter,   label: "X",         Icon: BrandX,         color: "text-foreground" },
    { url: lead.social_youtube,   label: "YouTube",   Icon: BrandYouTube,   color: "text-[#FF0000]" },
    { url: lead.social_tiktok,    label: "TikTok",    Icon: BrandTikTok,    color: "text-foreground" },
  ].filter((s) => s.url);

  if (socials.length === 0) return <span className="text-xs text-muted-foreground/50">—</span>;

  return (
    <div className="flex items-center gap-1.5">
      {socials.map(({ url, label, Icon, color }) => (
        <Tooltip key={label}>
          <TooltipTrigger asChild>
            <a
              href={url!}
              target="_blank"
              rel="noopener noreferrer"
              className={cn("inline-flex hover:opacity-60 transition-opacity", color)}
              onClick={(e) => e.stopPropagation()}
            >
              <Icon className="h-3.5 w-3.5" />
            </a>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

/* ── Column definitions factory ── */
interface ColumnActions {
  onEditLead: (lead: Lead) => void;
  onDeleteLead: (ids: string[]) => void;
  onStatusChange: (lead: Lead, status: LeadStatus) => Promise<void>;
}

export function createColumns(actions: ColumnActions): ColumnDef<Lead>[] {
  return [
    /* Select */
    {
      id: "select",
      header: ({ table }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected()
                ? true
                : table.getIsSomePageRowsSelected()
                  ? "indeterminate"
                  : false
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Alle auswählen"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="relative z-10" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            className="cursor-pointer"
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label={`${row.original.company} auswählen`}
          />
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40,
    },

    /* Firma — Favicon + Name + Web */
    {
      accessorKey: "company",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Firma" />,
      cell: ({ row }) => {
        const lead = row.original;
        const cleanWeb = lead.website?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? null;
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2.5 min-w-0">
                <CompanyFavicon website={lead.website} size={7} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium leading-tight text-foreground truncate">
                    {lead.company}
                  </p>
                  {cleanWeb ? (
                    <a
                      href={lead.website?.startsWith("http") ? lead.website : `https://${cleanWeb}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-muted-foreground hover:text-primary truncate block leading-tight mt-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {cleanWeb}
                    </a>
                  ) : (lead.ceo_name || lead.name) ? (
                    <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                      {lead.ceo_name ?? lead.name}
                    </p>
                  ) : null}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">{lead.company}</p>
              {(lead.ceo_name || lead.name) && (
                <p className="text-xs text-muted-foreground">{lead.ceo_name ?? lead.name}</p>
              )}
            </TooltipContent>
          </Tooltip>
        );
      },
      enableHiding: false,
      size: 280,
    },

    /* Branche — plain text */
    {
      accessorKey: "industry",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Branche" />,
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        if (!v) return <span className="text-xs text-muted-foreground/50">—</span>;
        return <span className="text-[12.5px] text-muted-foreground truncate block max-w-[140px]" title={v}>{v}</span>;
      },
      size: 150,
    },

    /* Rechtsform */
    {
      accessorKey: "legal_form",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Rechtsform" />,
      cell: ({ getValue }) => {
        const lf = getValue() as string | null;
        if (!lf) return <span className="text-xs text-muted-foreground/50">—</span>;
        return <span className="text-xs text-muted-foreground truncate block max-w-[120px]">{lf}</span>;
      },
      size: 140,
    },

    /* Ort */
    {
      id: "city",
      accessorFn: (row) => [row.postal_code, row.city].filter(Boolean).join(" ") || "—",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ort" />,
      cell: ({ row }) => {
        const lead = row.original;
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <div className="min-w-0">
                  <span className="truncate block max-w-[110px]">
                    {[lead.postal_code, lead.city].filter(Boolean).join(" ") || "—"}
                  </span>
                  {lead.country && (
                    <span className="text-[10px] text-muted-foreground/60 truncate block max-w-[110px]">
                      {countryLabel(lead.country)}
                    </span>
                  )}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-xs space-y-0.5">
                {(lead.street || lead.address) && <p>{lead.street ?? lead.address}</p>}
                <p>{[lead.postal_code, lead.city].filter(Boolean).join(" ")}</p>
                {lead.country && <p>{countryLabel(lead.country)}</p>}
              </div>
            </TooltipContent>
          </Tooltip>
        );
      },
      size: 140,
    },

    /* Kontakt */
    {
      id: "contact",
      header: "Kontakt",
      cell: ({ row }) => {
        const lead = row.original;
        return (
          <div className="flex flex-col gap-0.5">
            {lead.phone ? (
              <a
                href={`tel:${lead.phone}`}
                className="text-xs text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {lead.phone}
              </a>
            ) : (
              <span className="text-xs text-muted-foreground/50">—</span>
            )}
            {lead.email && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={`mailto:${lead.email}`}
                    className="text-[11px] text-muted-foreground hover:text-primary hover:underline truncate max-w-[170px] block"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {lead.email}
                  </a>
                </TooltipTrigger>
                <TooltipContent>{lead.email}</TooltipContent>
              </Tooltip>
            )}
          </div>
        );
      },
      enableSorting: false,
      size: 200,
    },

    /* Entscheider:in — ohne Avatar */
    {
      id: "ceo",
      header: "Entscheider:in",
      cell: ({ row }) => {
        const lead = row.original;
        const ceoName = lead.ceo_name;
        if (!ceoName) return <span className="text-xs text-muted-foreground/50">—</span>;
        return (
          <div className="min-w-0 leading-tight">
            <div className="text-[13px] text-foreground truncate">{ceoName}</div>
          </div>
        );
      },
      enableSorting: false,
      size: 180,
    },

    /* Website */
    {
      accessorKey: "website",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Website" />,
      cell: ({ getValue }) => {
        const website = getValue() as string | null;
        if (!website) return <span className="text-xs text-muted-foreground/50">—</span>;
        return (
          <a
            href={website.startsWith("http") ? website : `https://${website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            <span className="truncate max-w-[90px]">
              {website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </span>
          </a>
        );
      },
      size: 130,
    },

    /* Social */
    {
      id: "social",
      header: "Social",
      cell: ({ row }) => <SocialIcons lead={row.original} />,
      enableSorting: false,
      size: 110,
    },

    /* Status */
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => {
        const cfg = LEAD_STATUS_CONFIG[row.original.status];
        return (
          <span className={`badge-status ${cfg.className}`}>
            <span className="dot" />
            {cfg.label}
          </span>
        );
      },
      size: 130,
    },

    /* Hinzugefügt (Datum, sortierbar) */
    {
      accessorKey: "created_at",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Hinzugefügt" />,
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        if (!v) return <span className="text-xs text-muted-foreground/50">—</span>;
        return (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {new Date(v).toLocaleDateString("de-AT", { day: "2-digit", month: "short", year: "numeric" })}
          </span>
        );
      },
      size: 120,
    },

    /* Actions */
    {
      id: "actions",
      cell: ({ row }) => {
        const lead = row.original;
        const cfg = LEAD_STATUS_CONFIG[lead.status];
        return (
          <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 transition-opacity"
               onClick={(e) => e.stopPropagation()}>
            {lead.email && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={`mailto:${lead.email}`}
                    className="inline-grid place-items-center h-7 w-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <Mail className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </a>
                </TooltipTrigger>
                <TooltipContent>E-Mail</TooltipContent>
              </Tooltip>
            )}
            {lead.phone && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={`tel:${lead.phone}`}
                    className="inline-grid place-items-center h-7 w-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <PhoneIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </a>
                </TooltipTrigger>
                <TooltipContent>Anrufen</TooltipContent>
              </Tooltip>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                  <span className="sr-only">Aktionen</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Aktionen
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-xs gap-2 cursor-pointer"
                  onClick={() => actions.onEditLead(lead)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Bearbeiten
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="text-xs gap-2 cursor-pointer">
                    <span className={cn("h-2 w-2 rounded-full shrink-0", cfg.dot)} />
                    Status ändern
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-44">
                    {STATUS_LIST.map((opt) => (
                      <DropdownMenuItem
                        key={opt.value}
                        className="text-xs gap-2 cursor-pointer"
                        disabled={opt.value === lead.status}
                        onClick={() => actions.onStatusChange(lead, opt.value)}
                      >
                        <span className={cn("h-2 w-2 rounded-full shrink-0", opt.dot)} />
                        {opt.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-xs gap-2 cursor-pointer text-destructive focus:text-destructive"
                  onClick={() => actions.onDeleteLead([lead.id])}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Löschen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false,
      size: 110,
    },
  ];
}
