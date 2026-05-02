import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

/** Roll / FAB UI lives in ``GMConsoleSlider`` (not this file). Macro syntax ``@Actor !key`` is resolved there via ``useSystemActions`` + ``tryResolveActorMacroRoll``. */

export type GMConsoleContextValue = {
  isFabSummoned: boolean;
  setIsFabSummoned: React.Dispatch<React.SetStateAction<boolean>>;
  summonConsole: () => void;
  dismissConsole: () => void;
};

const GMConsoleContext = createContext<GMConsoleContextValue | null>(null);

export function GMConsoleProvider({ children }: { children: React.ReactNode }) {
  const [isFabSummoned, setIsFabSummoned] = useState(true);

  const summonConsole = useCallback(() => {
    setIsFabSummoned(true);
  }, []);

  const dismissConsole = useCallback(() => {
    setIsFabSummoned(false);
  }, []);

  const value = useMemo(
    () => ({
      isFabSummoned,
      setIsFabSummoned,
      summonConsole,
      dismissConsole,
    }),
    [isFabSummoned, summonConsole, dismissConsole],
  );

  return <GMConsoleContext.Provider value={value}>{children}</GMConsoleContext.Provider>;
}

export function useGMConsole(): GMConsoleContextValue {
  const ctx = useContext(GMConsoleContext);
  if (!ctx) throw new Error('useGMConsole must be used within GMConsoleProvider');
  return ctx;
}
