import { Component } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from './ui';

/** Contains render crashes to the current page so navigation keeps working. */
export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const chunkError = /Loading chunk|dynamically imported module|Failed to fetch/i.test(this.state.error.message);
    return (
      <div className="page">
        <div className="state state--error" role="alert" style={{ minHeight: '50vh' }}>
          <div className="state__icon" aria-hidden="true"><AlertTriangle /></div>
          <p className="state__title">{chunkError ? 'A new version is available' : 'This page ran into a problem'}</p>
          <p className="state__description">
            {chunkError ? 'Reload to get the latest version of LifeOS.' : 'Your data is safe. Try again, or head back to the dashboard.'}
          </p>
          <div className="state__action">
            <Button icon={RotateCw} onClick={() => (chunkError ? window.location.reload() : this.setState({ error: null }))}>
              {chunkError ? 'Reload' : 'Try again'}
            </Button>
            <Button variant="ghost" onClick={() => (window.location.href = '/')}>Go to dashboard</Button>
          </div>
        </div>
      </div>
    );
  }
}
