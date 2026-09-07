import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ children, className = '', onClick, ...rest }) => {
  return (
    <div
      className={`bg-white rounded-xl shadow-card border border-neutral-200/90 ring-1 ring-neutral-900/[0.04] ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      {...rest}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<CardProps> = ({ children, className = '' }) => {
  return <div className={`px-6 py-4 border-b border-neutral-200 ${className}`}>{children}</div>;
};

export const CardContent: React.FC<CardProps> = ({ children, className = '' }) => {
  return <div className={`px-6 py-4 ${className}`}>{children}</div>;
};

export const CardTitle: React.FC<CardProps> = ({ children, className = '' }) => {
  return <h3 className={`text-lg font-semibold text-neutral-800 ${className}`}>{children}</h3>;
};

