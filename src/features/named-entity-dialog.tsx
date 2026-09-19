import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import type { Ledger, Named } from "@/domain/model";
export type NamedSelection = {
  kind: "categories" | "tags";
  entity: Named;
  action: "edit" | "delete";
};

export function NamedEntityDialog({
  selection,
  ledger,
  onChange,
  onClose,
}: {
  selection: NamedSelection;
  ledger: Ledger;
  onChange: (ledger: Ledger) => void;
  onClose: () => void;
}) {
  const { kind, entity, action } = selection;
  const [name, setName] = useState(entity.name);
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const label = kind === "categories" ? "categoria" : "tag";
  const linked = (entry: { categoryId: string | null; tagIds: string[] }) =>
    kind === "categories"
      ? entry.categoryId === entity.id
      : entry.tagIds.includes(entity.id);
  const transactionCount = ledger.transactions.filter(linked).length;
  const recurrenceCount = ledger.recurrences.filter(linked).length;
  const hasLinks = transactionCount + recurrenceCount > 0;
  const candidates = ledger[kind].filter((item) => item.id !== entity.id);
  async function save() {
    setBusy(true);
    setError("");
    try {
      const next =
        action === "edit"
          ? await window.lume.saveNamed(kind, { ...entity, name })
          : await window.lume.deleteNamed(kind, entity.id, destination || null);
      onChange(next);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  if (action === "edit")
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !busy) onClose();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar {label}</DialogTitle>
            <DialogDescription>
              A alteração do nome mantém todos os vínculos.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="field">
              <Label htmlFor="entity-name">Nome</Label>
              <Input
                id="entity-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={120}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy} className="w-full">
              Salvar {label}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    );
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <AlertDialogContent className="max-h-[90vh] overflow-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">
            Excluir {label} “{entity.name}”?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {transactionCount} lançamento(s) e {recurrenceCount} recorrência(s)
            vinculados.{" "}
            {hasLinks
              ? "Escolha o destino antes de excluir. Os registros e seus valores serão preservados."
              : "Este item não tem registros vinculados."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="field">
          <Label htmlFor="entity-destination">
            {kind === "categories" ? "Categoria de destino" : "Tag de destino"}
          </Label>
          <NativeSelect
            id="entity-destination"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            disabled={busy || !candidates.length}
          >
            <NativeSelectOption value="">
              {hasLinks ? "Selecione um destino" : "Sem vínculos para mover"}
            </NativeSelectOption>
            {candidates.map((item) => (
              <NativeSelectOption key={item.id} value={item.id}>
                {item.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        {hasLinks && !candidates.length && (
          <p className="text-sm text-amber-300">
            Cadastre outra {label} antes de excluir esta.
          </p>
        )}
        {kind === "tags" && hasLinks && (
          <p className="text-xs text-muted-foreground">
            Se um registro já tiver a tag de destino, ela será mantida uma única
            vez.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy || (hasLinks && !destination)}
            onClick={() => void save()}
          >
            {busy ? "Salvando…" : hasLinks ? "Mover e excluir" : "Excluir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
