"use client";

import {
  flexRender,
  useReactTable,
  getCoreRowModel,
  type SortingState,
  type VisibilityState,
  type ColumnDef,
} from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Kbd } from "@/components/ui/kbd";
import { Pencil, Trash2 } from "lucide-react";
import type { Lead, LeadStatus } from "@/types/leads";

import { LEAD_STATUS_CONFIG } from "./columns";

// Re-export for backward compat
export { LEAD_STATUS_CONFIG } from "./columns";

const STATUS_LIST: { value: LeadStatus; label: string; dot: string }[] = [
  { value: "new",            label: "Neu",            dot: "bg-sky-500" },
  { value: "contacted",      label: "Kontaktiert",    dot: "bg-blue-500" },
  { value: "interested",     label: "Interessiert",   dot: "bg-primary" },
  { value: "not_interested", label: "Kein Interesse", dot: "bg-muted-foreground/50" },
  { value: "converted",      label: "Konvertiert",    dot: "bg-indigo-600" },
];

interface LeadsTableProps {
  leads: Lead[];
  columns: ColumnDef<Lead>[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onEditLead: (lead: Lead) => void;
  onDeleteLead: (ids: string[]) => void;
  onStatusChange: (lead: Lead, status: LeadStatus) => Promise<void>;
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: (visibility: VisibilityState) => void;
}

export function LeadsTable({
  leads,
  columns,
  selectedIds,
  onSelectionChange,
  onEditLead,
  onDeleteLead,
  onStatusChange,
  sorting,
  onSortingChange,
  columnVisibility,
  onColumnVisibilityChange,
}: LeadsTableProps) {
  // Bridge Set<string> ↔ Record<string, boolean>
  const rowSelection: Record<string, boolean> = {};
  leads.forEach((lead) => {
    if (selectedIds.has(lead.id)) rowSelection[lead.id] = true;
  });

  const table = useReactTable({
    data: leads,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
    },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      onSortingChange(next);
    },
    onColumnVisibilityChange: (updater) => {
      const next = typeof updater === "function" ? updater(columnVisibility) : updater;
      onColumnVisibilityChange(next);
    },
    onRowSelectionChange: (updater) => {
      const current: Record<string, boolean> = {};
      leads.forEach((lead) => {
        if (selectedIds.has(lead.id)) current[lead.id] = true;
      });
      const next = typeof updater === "function" ? updater(current) : updater;
      const ids = new Set<string>();
      for (const [id, selected] of Object.entries(next)) {
        if (selected) {
          ids.add(id);
        }
      }
      onSelectionChange(ids);
    },
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    getRowId: (row) => row.id,
  });

  return (
    <div className="overflow-x-auto">
      <Table className="table-fixed">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent border-b bg-card">
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className="h-[42px] px-3.5 text-[11.5px] font-medium text-muted-foreground tracking-wide whitespace-nowrap"
                  style={{ width: header.getSize() }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => {
            const lead = row.original;
            const cfg = LEAD_STATUS_CONFIG[lead.status];
            return (
              <ContextMenu key={row.id}>
                <ContextMenuTrigger asChild>
                  <TableRow
                    className={cn(
                      "cursor-pointer transition-colors group border-b last:border-b-0",
                      row.getIsSelected()
                        ? "bg-accent hover:bg-accent/80"
                        : "hover:bg-muted/40",
                    )}
                    onClick={() => onEditLead(lead)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className="py-3 px-3.5 align-middle text-[13px]"
                        style={{ width: cell.column.getSize() }}
                        onClick={cell.column.id === "select" ? (e) => e.stopPropagation() : undefined}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48">
                  <ContextMenuLabel className="text-xs font-normal text-muted-foreground">
                    Aktionen
                  </ContextMenuLabel>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    className="text-xs gap-2 cursor-pointer"
                    onClick={() => onEditLead(lead)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Bearbeiten
                    <ContextMenuShortcut><Kbd>E</Kbd></ContextMenuShortcut>
                  </ContextMenuItem>
                  <ContextMenuSub>
                    <ContextMenuSubTrigger className="text-xs gap-2 cursor-pointer">
                      <span className={cn("h-2 w-2 rounded-full shrink-0", cfg.dot)} />
                      Status ändern
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-44">
                      {STATUS_LIST.map((opt) => (
                        <ContextMenuItem
                          key={opt.value}
                          className="text-xs gap-2 cursor-pointer"
                          disabled={opt.value === lead.status}
                          onClick={() => onStatusChange(lead, opt.value)}
                        >
                          <span className={cn("h-2 w-2 rounded-full shrink-0", opt.dot)} />
                          {opt.label}
                        </ContextMenuItem>
                      ))}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    variant="destructive"
                    className="text-xs gap-2 cursor-pointer"
                    onClick={() => onDeleteLead([lead.id])}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Löschen
                    <ContextMenuShortcut><Kbd>Del</Kbd></ContextMenuShortcut>
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
