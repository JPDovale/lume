import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CALCULATOR_HISTORY_LIMIT,
  type Calculation,
} from "@/domain/calculator";
import { CalculatorWindow } from "./calculator-window";
export function CalculatorWorkspace() {
  const [windows, setWindows] = useState<number[]>([]),
    [history, setHistory] = useState<Calculation[]>([]),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const next = useRef(0),
    launcher = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let active = true;
    window.lume
      .calculatorHistory()
      .then((entries) => {
        if (active) {
          setHistory(entries);
          setReady(true);
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, []);
  async function calculate(expression: string) {
    const entry = await window.lume.calculate(expression);
    setHistory((previous) =>
      [entry, ...previous].slice(0, CALCULATOR_HISTORY_LIMIT),
    );
    return entry;
  }
  return (
    <>
      <Button
        ref={launcher}
        variant="outline"
        size="icon"
        title="Abrir calculadora (pode abrir várias)"
        aria-label="Abrir calculadora"
        onClick={() => {
          const id = ++next.current;
          setWindows((previous) => [...previous, id]);
        }}
      >
        <Calculator size={16} />
      </Button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
      {createPortal(
        <div className="pointer-events-none fixed inset-0 z-30">
          {[...windows]
            .sort((a, b) => a - b)
            .map((id) => (
              <CalculatorWindow
                key={id}
                number={id}
                layer={windows.indexOf(id)}
                history={history}
                ready={ready}
                onCalculate={calculate}
                onActivate={() =>
                  setWindows((previous) =>
                    previous.at(-1) === id
                      ? previous
                      : [...previous.filter((v) => v !== id), id],
                  )
                }
                onClose={() => {
                  setWindows((previous) => previous.filter((v) => v !== id));
                  launcher.current?.focus();
                }}
              />
            ))}
        </div>,
        document.body,
      )}
    </>
  );
}
