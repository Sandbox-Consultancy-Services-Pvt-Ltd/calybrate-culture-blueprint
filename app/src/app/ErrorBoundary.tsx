import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  name: string;
  children: ReactNode;
}

/** One broken view must never blank the whole app. */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`View "${this.props.name}" crashed`, error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <div role="alert" className="view-error">
          <b>This section could not be shown.</b> Reload the page, or open another section from the menu.
        </div>
      );
    }
    return this.props.children;
  }
}
