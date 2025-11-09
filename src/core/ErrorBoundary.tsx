import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex h-full w-full items-center justify-center bg-[#292828] p-8">
          <div className="max-w-2xl rounded-lg border border-red-500/20 bg-[#1a1a1a] p-8 shadow-xl">
            <div className="mb-6 flex items-center gap-3">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <h2 className="text-2xl font-bold text-white">
                Something went wrong
              </h2>
            </div>

            <p className="mb-6 text-pierre-text-secondary">
              An unexpected error occurred. This might be due to a complex model
              or a temporary issue. You can try resetting the component or
              reloading the page.
            </p>

            {this.state.error && (
              <div className="mb-6 rounded-md bg-[#0f0f0f] p-4">
                <p className="mb-2 text-sm font-semibold text-red-400">
                  Error Details:
                </p>
                <pre className="overflow-x-auto text-xs text-pierre-text-secondary">
                  {this.state.error.toString()}
                </pre>
                {process.env.NODE_ENV === 'development' &&
                  this.state.errorInfo && (
                    <details className="mt-4">
                      <summary className="cursor-pointer text-xs text-pierre-text-secondary hover:text-white">
                        Stack Trace
                      </summary>
                      <pre className="mt-2 overflow-x-auto text-xs text-pierre-text-secondary">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </details>
                  )}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={this.handleReset}
                className="flex items-center gap-2"
                variant="default"
              >
                <RefreshCw className="h-4 w-4" />
                Try Again
              </Button>
              <Button
                onClick={this.handleReload}
                variant="outline"
                className="flex items-center gap-2"
              >
                Reload Page
              </Button>
            </div>

            <p className="mt-6 text-xs text-pierre-text-secondary">
              If this error persists, try simplifying your model request or
              using the Pierre model instead of Metro Boomin.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
