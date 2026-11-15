import React, { Component, Suspense } from "react";
import { useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";

function PageLoading({ fullScreen }) {
  return (
    <div role="status" aria-live="polite" className={`flex items-center justify-center bg-surface dark:bg-canvas ${fullScreen ? "min-h-screen" : "min-h-[50vh]"}`}>
      <div className="flex items-center gap-3 text-sm text-muted">
        <Loader2 size={24} className="animate-spin text-action" aria-hidden="true" />
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
        <div role="alert" className={`flex items-center justify-center p-4 ${this.props.fullScreen ? "min-h-screen" : "min-h-[50vh]"}`}>
          <div className="max-w-sm space-y-4 text-center text-ink dark:text-muted">
            <p>This page couldn’t load. Check your connection and reload to try again.</p>
            <button type="button" onClick={() => window.location.reload()}
              className="rounded-md bg-action px-5 py-3 text-sm text-on-action dark:bg-surface dark:text-ink">
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
