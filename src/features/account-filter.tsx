import { Popover } from "@base-ui/react/popover";
import { Landmark } from "lucide-react";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import type { Ledger } from "@/domain/model";
export function AccountFilter({
  ledger,
  value,
  onChange,
  onPrimary,
  spending,
}: {
  ledger: Ledger;
  value: string;
  onChange: (value: string) => void;
  onPrimary: (id: string) => void;
  spending: boolean;
}) {
  const primary = ledger.accounts.find(
    (a) => a.id === ledger.settings?.primaryAccountId,
  );
  const excluded = ledger.settings?.excludedSpendingAccountIds ?? [];
  const current =
    value === "all"
      ? "Todas as contas"
      : value === "primary"
        ? (primary?.name ?? "Todas as contas")
        : (ledger.accounts.find((a) => a.id === value)?.name ?? "Conta");
  return (
    <Popover.Root>
      <Popover.Trigger
        render={<Button variant="outline" size="icon" />}
        aria-label="Selecionar conta"
        title={`Conta: ${current}`}
      >
        <Landmark size={16} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-50"
        >
          <Popover.Popup className="w-80 max-w-[calc(100vw-24px)] rounded-xl border border-border bg-popover p-4 shadow-xl outline-none space-y-4">
            <Popover.Title className="text-sm font-medium">
              Conta da visualização
            </Popover.Title>
            <Popover.Description className="text-xs text-muted-foreground">
              Exibindo: {current}
            </Popover.Description>
            <label className="field text-xs text-muted-foreground">
              Conta da visualização
              <NativeSelect
                aria-label="Filtrar por conta"
                value={value}
                onChange={(e) => onChange(e.target.value)}
              >
                <NativeSelectOption value="primary">
                  {primary
                    ? `Principal · ${primary.name}`
                    : "Conta principal não definida"}
                </NativeSelectOption>
                <NativeSelectOption value="all">
                  Todas as contas
                </NativeSelectOption>
                {ledger.accounts.map((a) => (
                  <NativeSelectOption key={a.id} value={a.id}>
                    {a.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            {value !== "all" &&
              value !== "primary" &&
              value !== primary?.id && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPrimary(value)}
                >
                  Definir como principal
                </Button>
              )}
            <p className="text-xs text-muted-foreground flex-1 min-w-40">
              {spending &&
              (value === "all" || (value === "primary" && !primary)) &&
              excluded.length
                ? `${excluded.length} conta(s) fora das análises de gastos. Configure em Organização. O patrimônio continua incluindo essas contas.`
                : value === "primary" && !primary
                  ? "Escolha uma conta e defina-a como principal. Por enquanto, mostramos o conjunto das contas."
                  : spending &&
                      excluded.includes(
                        value === "primary" ? (primary?.id ?? "") : value,
                      )
                    ? "Esta conta está fora dos gastos consolidados. Ao selecioná-la diretamente, seus dados são exibidos para análise."
                    : "Os números desta tela respeitam a conta selecionada."}
            </p>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
