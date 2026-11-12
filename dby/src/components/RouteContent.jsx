import React, { Component, Suspense } from "react";
import { useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";

function PageLoading({ fullScreen }) {
  return (
    <div role="status" aria-live="polite" className={`flex items-center justify-center bg-white dark:bg-[#030303] ${fullScreen ? "min-h-screen" : "min-h-[50vh]"}`}>
      <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-white/60">
        <Loader2 size={24} className="animate-spin text-[#D4AF37]" aria-hidden="true" />
        <span>Loading page…</span>
      </div>
    </div>
  );
}

class PageLoadBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(previousProps) {
    if (this.state.failed && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (this.state.failed) {
      return (
        <div role="alert" className={`flex items-center justify-center p-6 ${this.props.fullScreen ? "min-h-screen" : "min-h-[50vh]"}`}>
          <div className="max-w-sm space-y-4 text-center text-gray-700 dark:text-white/70">
            <p>This page couldn’t load. Check your connection and reload to try again.</p>
            <button type="button" onClick={() => window.location.reload()}
              className="rounded-lg bg-gray-900 px-5 py-3 text-sm text-white dark:bg-white dark:text-black">
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Nested dashboard boundaries keep navigation visible while the next page loads.
export default function RouteContent({ children, fullScreen = false }) {
  const location = useLocation();
  return (
    <PageLoadBoundary resetKey={`${location.key}:${location.pathname}${location.search}`} fullScreen={fullScreen}>
      <Suspense fallback={<PageLoading fullScreen={fullScreen} />}>
        {children}
      </Suspense>
    </PageLoadBoundary>
  );
}
