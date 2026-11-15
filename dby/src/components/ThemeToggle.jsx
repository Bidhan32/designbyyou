import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from "../context/ThemeContext.helpers.js"; // Ensure this path matches your folder structure // Ensure this path matches your folder structure

export default function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            onClick={toggleTheme}
            className="flex items-center justify-center w-10 h-9 rounded-md transition-all duration-300 bg-subtle text-ink hover:bg-subtle border border-transparent dark:border-line"
            aria-label="Toggle Theme"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
            {theme === 'dark' ? (
                <Sun size={18} className="text-action" />
            ) : (
                <Moon size={18} className="text-action" />
            )}
        </button>
    );
}