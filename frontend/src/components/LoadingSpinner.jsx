import { Loader2 } from 'lucide-react';

export default function LoadingSpinner() {
  return (
    <div className="loading-spinner">
      <div className="relative">
        <Loader2 className="loading-spinner-ring text-blue-400" />
        <div className="loading-spinner-pulse"></div>
      </div>
      <p className="text-slate-500 text-sm font-medium">Loading pools data...</p>
    </div>
  );
}
