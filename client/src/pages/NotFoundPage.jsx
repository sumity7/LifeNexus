import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Card, EmptyState } from '../components/ui';

export default function NotFoundPage() {
  return (
    <div className="page">
      <Card>
        <EmptyState
          icon={Compass}
          title="Page not found"
          description="The page you're looking for doesn't exist or has moved."
          action={<Link to="/" className="btn btn--primary"><span className="btn__content">Back to dashboard</span></Link>}
        />
      </Card>
    </div>
  );
}
