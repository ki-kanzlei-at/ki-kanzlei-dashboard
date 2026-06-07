"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { LeadFilters } from "@/types/leads";

interface LeadDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** IDs der zu löschenden Leads (nur relevant bei isGlobalSelected=false) */
  leadIds: string[];
  onDeleted: () => void;
  isGlobalSelected?: boolean;
  totalCount?: number;
  filters?: LeadFilters;
}

export function LeadDeleteDialog({
  open,
  onOpenChange,
  leadIds,
  onDeleted,
  isGlobalSelected = false,
  totalCount = 0,
  filters,
}: LeadDeleteDialogProps) {
  const [deleting, setDeleting] = useState(false);
  
  // Der anzuzeigende Count ist entweder die Anzahl der IDs oder der globale Gesamt-Count
  const count = isGlobalSelected ? totalCount : leadIds.length;

  async function handleDelete() {
    setDeleting(true);
    try {
      if (isGlobalSelected) {
        // Globaler Delete mittels Filtern
        const res = await fetch("/api/leads/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            action: "delete", 
            selectionMode: "all", 
            filters 
          }),
        });
        if (!res.ok) throw new Error();
      } else if (count === 1) {
        // Einzelner Delete über spezifische ID
        const res = await fetch(`/api/leads/${leadIds[0]}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
      } else {
        // Normaler Bulk Delete über IDs
        const res = await fetch("/api/leads/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", ids: leadIds }),
        });
        if (!res.ok) throw new Error();
      }

      toast.success(
        count === 1
          ? "Lead gelöscht"
          : `${count} Leads gelöscht`,
      );
      onOpenChange(false);
      onDeleted();
    } catch {
      toast.error("Fehler beim Löschen");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-[420px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {count === 1 ? "Lead löschen" : `${count} Leads löschen`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {count === 1
              ? "Möchtest du diesen Lead wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden."
              : `Möchtest du ${count} Leads wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>
            Abbrechen
          </AlertDialogCancel>
          <AlertDialogAction
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={(e) => {
              e.preventDefault();
              handleDelete();
            }}
            disabled={deleting}
          >
            {deleting && <Spinner className="h-4 w-4 mr-2" />}
            {count === 1 ? "Löschen" : `${count} löschen`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
