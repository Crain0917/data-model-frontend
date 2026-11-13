import type { ReactNode } from 'react';

export default function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-block">
      <div className="empty-illustration">{icon}</div>
      <h3 className="empty-title">{title}</h3>
      {text ? <p className="empty-text">{text}</p> : null}
      {action}
    </div>
  );
}
