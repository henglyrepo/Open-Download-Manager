import { Layers, ArrowDownCircle, CheckCircle, Clock, Calendar } from 'lucide-react';
import { useDownloadStore, getCategoryCount } from '../stores/downloadStore';
import { CategoryFilter } from '../types/download';

const categories: { id: CategoryFilter; name: string; icon: typeof Layers }[] = [
  { id: 'all', name: 'All Downloads', icon: Layers },
  { id: 'downloading', name: 'Downloading', icon: ArrowDownCircle },
  { id: 'completed', name: 'Completed', icon: CheckCircle },
  { id: 'queued', name: 'Queued', icon: Clock },
  { id: 'scheduled', name: 'Scheduled', icon: Calendar },
];

export function Sidebar() {
  const { downloads, category, setCategory } = useDownloadStore();

  return (
    <div className="sidebar">
      <div className="sidebar-title">Categories</div>
      {categories.map((cat) => {
        const Icon = cat.icon;
        const count = getCategoryCount(downloads, cat.id);
        return (
          <div
            key={cat.id}
            className={`category-item ${category === cat.id ? 'active' : ''}`}
            onClick={() => setCategory(cat.id)}
          >
            <Icon className="category-icon" size={18} />
            <span>{cat.name}</span>
            <span className="category-count">{count}</span>
          </div>
        );
      })}
    </div>
  );
}
