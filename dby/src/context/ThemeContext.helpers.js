// Shared helpers and state kept separate from the React refresh boundary.
import { createContext, useContext } from 'react';

const ThemeContext = createContext();

const useTheme = () => useContext(ThemeContext);

export { ThemeContext, useTheme };
