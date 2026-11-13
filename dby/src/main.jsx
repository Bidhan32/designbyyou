import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
// 🚀 IMPORT YOUR NEW THEME PROVIDER
import { ThemeProvider } from './context/ThemeContext'; 

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
      {/* 🚀 WRAP YOUR APP INSIDE THE THEME PROVIDER */}
      <ThemeProvider> 
        <App />
      </ThemeProvider>
  </React.StrictMode>
);
