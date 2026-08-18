"use client";

/**
 * Listbox de sugestões para o autocomplete do campo de novo item (LB-13).
 * Presentacional: recebe as sugestões e o índice ativo; o teclado (↓/↑/Enter/Esc)
 * é tratado no `ListaScreen`, que controla `aria-activedescendant`. Sem lib.
 *
 * Alvo/touch ≥44px por option (LB-4); `max-h-72 overflow-y-auto` rola em viewport
 * estreita (mobile). Sem novos tokens de cor — reutiliza `--background`/
 * `--foreground` + realces `bg-current/10`/`bg-current/5` já usados no app.
 */
type ItemSuggestionsProps = {
  listboxId: string;
  suggestions: string[];
  activeIndex: number | null;
  onSelect: (texto: string) => void;
  onHover: (index: number) => void;
};

export function ItemSuggestions({
  listboxId,
  suggestions,
  activeIndex,
  onSelect,
  onHover,
}: ItemSuggestionsProps) {
  return (
    <div
      role="listbox"
      id={listboxId}
      aria-label="Itens sugeridos"
      className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded border border-current/20 bg-background py-1"
    >
      {suggestions.map((texto, i) => {
        const active = i === activeIndex;
        return (
          <button
            key={`${listboxId}-${i}`}
            type="button"
            role="option"
            id={`${listboxId}-opt-${i}`}
            aria-selected={active}
            // mouseDown preventDefault mantém o foco no input (não dispara blur
            // antes do click registrar) — padrão combobox, funciona em toque.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(texto)}
            onMouseMove={() => onHover(i)}
            className={`flex min-h-11 w-full items-center px-3 text-left text-base text-foreground ${
              active ? "bg-current/10" : "hover:bg-current/5"
            }`}
          >
            {texto}
          </button>
        );
      })}
    </div>
  );
}