"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}
interface State {
  error: Error | null;
}

/** Catches WebGL / render errors so a failed 3D scene never takes down a page. */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div className="flex h-full items-center justify-center rounded-xl border border-line bg-panel/60 p-8 text-center">
            <p className="text-sm text-zinc-500">
              3D visualization unavailable on this device.
              <br />
              <span className="text-xs text-zinc-600">{this.state.error.message}</span>
            </p>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
