import { useEffect, useRef, useState } from "react";
import { GripHorizontal, Minus, X, Delete } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Calculation } from "@/domain/calculator";
type Position = { x: number; y: number };
export function CalculatorWindow({
  number,
  layer,
  history,
  ready,
  onCalculate,
  onClose,
  onActivate,
}: {
  number: number;
  layer: number;
  history: Calculation[];
  ready: boolean;
  onCalculate: (expression: string) => Promise<Calculation>;
  onClose: () => void;
  onActivate: () => void;
}) {
  const [expression, setExpression] = useState(""),
    [result, setResult] = useState("0"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [minimized, setMinimized] = useState(false);
  const [position, setPosition] = useState<Position>({
    x: Math.max(8, window.innerWidth - 344 - ((number - 1) % 5) * 28),
    y: 80 + ((number - 1) % 5) * 28,
  });
  const panel = useRef<HTMLElement>(null),
    input = useRef<HTMLInputElement>(null),
    drag = useRef<Position | null>(null);
  const clamp = (p: Position): Position => ({
    x: Math.max(
      8,
      Math.min(
        p.x,
        window.innerWidth - (panel.current?.offsetWidth ?? 328) - 8,
      ),
    ),
    y: Math.max(
      8,
      Math.min(
        p.y,
        window.innerHeight - (panel.current?.offsetHeight ?? 48) - 8,
      ),
    ),
  });
  useEffect(() => {
    const resize = () => setPosition((p) => clamp(p));
    resize();
    window.addEventListener("resize", resize);
    const observer = new ResizeObserver(resize);
    if (panel.current) observer.observe(panel.current);
    return () => {
      window.removeEventListener("resize", resize);
      observer.disconnect();
    };
  }, []);
  function insert(text: string, erase = false) {
    const start = input.current?.selectionStart ?? expression.length,
      end = input.current?.selectionEnd ?? start;
    const from = erase && start === end ? Math.max(0, start - 1) : start;
    setExpression(
      (
        expression.slice(0, from) +
        (erase ? "" : text) +
        expression.slice(end)
      ).slice(0, 160),
    );
    setError("");
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(
        from + (erase ? 0 : text.length),
        from + (erase ? 0 : text.length),
      );
    });
  }
  async function submit() {
    if (busy || !ready) return;
    setBusy(true);
    setError("");
    try {
      const entry = await onCalculate(expression);
      setResult(entry.result);
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : String(e)).replace(
          /^Error invoking remote method '[^']+': (?:Error: )?/,
          "",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      ref={panel}
      role="region"
      aria-label={`Calculadora ${number}`}
      onPointerDownCapture={onActivate}
      onFocusCapture={onActivate}
      className="pointer-events-auto fixed w-[328px] max-w-[calc(100vw-16px)] max-h-[calc(100dvh-16px)] overflow-y-auto rounded-xl border border-border bg-background shadow-2xl"
      style={{ left: position.x, top: position.y, zIndex: 30 + layer }}
    >
      <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-border bg-secondary px-2 py-1">
        <div
          role="button"
          tabIndex={0}
          aria-label={`Mover calculadora ${number}`}
          title="Arraste ou use as setas do teclado"
          className="flex min-w-0 flex-1 cursor-grab touch-none items-center gap-2 rounded-md p-2 text-sm focus-visible:outline-2 focus-visible:outline-primary"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            drag.current = {
              x: e.clientX - position.x,
              y: e.clientY - position.y,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (drag.current)
              setPosition(
                clamp({
                  x: e.clientX - drag.current.x,
                  y: e.clientY - drag.current.y,
                }),
              );
          }}
          onPointerUp={(e) => {
            drag.current = null;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onKeyDown={(e) => {
            const delta: Record<string, Position> = {
              ArrowLeft: { x: -20, y: 0 },
              ArrowRight: { x: 20, y: 0 },
              ArrowUp: { x: 0, y: -20 },
              ArrowDown: { x: 0, y: 20 },
            };
            const d = delta[e.key];
            if (d) {
              e.preventDefault();
              setPosition((p) => clamp({ x: p.x + d.x, y: p.y + d.y }));
            }
          }}
        >
          <GripHorizontal size={16} />
          <span>Calculadora {number}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`${minimized ? "Restaurar" : "Minimizar"} calculadora ${number}`}
          onClick={() => setMinimized((v) => !v)}
        >
          <Minus size={15} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Fechar calculadora ${number}`}
          onClick={onClose}
        >
          <X size={15} />
        </Button>
      </div>
      <div hidden={minimized} className="p-3 space-y-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-2"
        >
          <label
            className="block text-xs text-muted-foreground"
            htmlFor={`calculator-expression-${number}`}
          >
            Expressão
          </label>
          <Input
            ref={input}
            autoFocus
            id={`calculator-expression-${number}`}
            value={expression}
            maxLength={160}
            placeholder="Ex.: (120 + 80) × 15%"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setExpression(e.target.value);
              setError("");
            }}
          />
          <output
            aria-label="Resultado"
            className="block max-h-20 overflow-auto rounded-lg bg-secondary p-3 text-right text-xl font-medium tabular-nums break-all"
            aria-live="polite"
          >
            {result}
          </output>
          {error && (
            <p role="alert" className="text-xs text-destructive break-words">
              {error}
            </p>
          )}
          <div className="grid grid-cols-4 gap-1.5">
            <Button
              type="button"
              variant="outline"
              aria-label="Limpar expressão"
              onClick={() => {
                setExpression("");
                setResult("0");
                setError("");
                input.current?.focus();
              }}
            >
              C
            </Button>
            {["(", ")"].map((key) => (
              <Button
                key={key}
                type="button"
                variant="outline"
                onClick={() => insert(key)}
              >
                {key}
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              aria-label="Apagar último caractere"
              onClick={() => insert("", true)}
            >
              <Delete size={16} />
            </Button>
            {[
              "7",
              "8",
              "9",
              "÷",
              "4",
              "5",
              "6",
              "×",
              "1",
              "2",
              "3",
              "-",
              "0",
              ",",
              "%",
              "+",
            ].map((key) => (
              <Button
                key={key}
                type="button"
                variant="secondary"
                onClick={() => insert(key)}
              >
                {key}
              </Button>
            ))}
            <Button
              type="submit"
              className="col-span-4"
              disabled={busy || !ready || !expression.trim()}
            >
              {busy ? "Calculando…" : "Calcular"}
            </Button>
          </div>
        </form>
        <p className="text-[10px] text-muted-foreground">
          Enter calcula · % divide por 100 · Até 12 casas decimais, sem
          separador de milhar.
        </p>
        <div className="border-t border-border pt-3">
          <h3 className="text-xs font-medium">Histórico compartilhado</h3>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Últimos 100 cálculos · Clique para reutilizar o resultado.
          </p>
          <div className="mt-2 max-h-28 overflow-y-auto space-y-1">
            {!history.length && (
              <p className="py-2 text-xs text-muted-foreground">
                {ready ? "Nenhum cálculo ainda." : "Carregando histórico…"}
              </p>
            )}
            {history.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="w-full rounded-md p-2 text-left text-xs hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
                aria-label={`Usar resultado ${entry.result} de ${entry.expression}`}
                onClick={() => {
                  setExpression(entry.result);
                  setResult(entry.result);
                  setError("");
                  input.current?.focus();
                }}
              >
                <span className="block break-all text-muted-foreground">
                  {entry.expression}
                </span>
                <span className="block break-all font-medium">
                  = {entry.result}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
