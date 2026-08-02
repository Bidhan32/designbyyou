import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext'; // Ensure this path matches your folder structure

export default function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            onClick={toggleTheme}
            className="flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300 bg-slate-200 text-slate-800 hover:bg-slate-300 dark:bg-white/10 dark:text-white dark:hover:bg-white/20 border border-transparent dark:border-white/5 shadow-md"
            aria-label="Toggle Theme"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
            {theme === 'dark' ? (
                <Sun size={18} className="text-[#D4AF37]" />
            ) : (
                <Moon size={18} className="text-indigo-600" />
            )}
        </button>
    );
}