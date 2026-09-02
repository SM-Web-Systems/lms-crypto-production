import { create } from "zustand";

type Theme = "dark" | "light";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem("amma-wallet-theme");
  if (stored === "light" || stored === "dark") return stored;
  return "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("amma-wallet-theme", theme);
}

export const useThemeStore = create<ThemeState>((set) => {
  const initial = getInitialTheme();
  // Apply on load
  if (typeof document !== "undefined") applyTheme(initial);

  return {
    theme: initial,
    setTheme: (theme) => {
      applyTheme(theme);
      set({ theme });
    },
    toggleTheme: () => {
      set((state) => {
        const next = state.theme === "dark" ? "light" : "dark";
        applyTheme(next);
        return { theme: next };
      });
    },
  };
});
