// Shared helpers and state kept separate from the React refresh boundary.
import { createContext, useContext } from 'react';

const ToastContext = createContext();

const useToast = () => useContext(ToastContext);

export { ToastContext, useToast };
