import { useEffect, useState } from "react";
import { ThemeContext } from "./ThemeContext.helpers.js";

const preferenceKey = "theme";
const darkPreference = "(prefers-color-scheme: dark)";

function readPreference() {
  try {
    const value = localStorage.getItem(preferenceKey);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(readPreference);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(darkPreference).matches);
  const theme = preference || (systemDark ? "dark" : "light");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia(darkPreference);
    const onSystemChange = event => setSystemDark(event.matches);
    const onStorage = event => {
      if (event.key === preferenceKey || event.key === null) setPreference(readPreference());
    };
    media.addEventListener("change", onSystemChange);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setPreference(next);
    try { localStorage.setItem(preferenceKey, next); } catch { /* This visit still uses the chosen theme. */ }
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}
