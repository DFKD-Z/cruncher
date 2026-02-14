import React from "react";

interface AppErrorBoundaryProps {
  title: string;
  message: string;
  reloadLabel: string;
  children: React.ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // Keep logging for debugging crash sources in production.
    console.error("AppErrorBoundary caught error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-sm p-6 text-center">
            <h2 className="text-lg font-semibold mb-2">{this.props.title}</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
              {this.props.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors"
            >
              {this.props.reloadLabel}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

