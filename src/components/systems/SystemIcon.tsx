import React, { useState } from 'react';
import {
  ExternalLink, Database, Globe, CalendarClock, CreditCard, HeadphonesIcon, BookOpen, Settings,
  Mail, Users, Calculator, Package, Truck, FileText, ShoppingCart, Phone, Briefcase,
} from 'lucide-react';
import type { ExternalSystem } from '../../types';

export const iconMap: Record<string, React.ElementType> = {
  Database, Globe, CalendarClock, CreditCard, HeadphonesIcon, BookOpen, Settings, ExternalLink,
  Mail, Users, Calculator, Package, Truck, FileText, ShoppingCart, Phone, Briefcase,
};

const sizes = {
  sm: { box: 'w-9 h-9 rounded-xl', icon: 'w-5 h-5' },
  md: { box: 'w-14 h-14 rounded-2xl', icon: 'w-6 h-6' },
  lg: { box: 'w-16 h-16 rounded-2xl', icon: 'w-8 h-8' },
};

/** The app's uploaded logo when it has one, otherwise its coloured icon. Falls back to the icon if the image fails to load. */
export const SystemIcon: React.FC<{ system: ExternalSystem; size?: keyof typeof sizes; className?: string }> = ({ system, size = 'md', className = '' }) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const s = sizes[size];
  const image = system.imageUrl && system.imageUrl !== failedUrl ? system.imageUrl : '';

  if (image) {
    return (
      <span className={`${s.box} shrink-0 overflow-hidden bg-white border border-line flex items-center justify-center ${className}`}>
        <img src={image} alt="" loading="lazy" onError={() => setFailedUrl(image)} className="w-full h-full object-contain" />
      </span>
    );
  }

  const Icon = iconMap[system.iconName] || Settings;
  return (
    <span className={`${s.box} shrink-0 flex items-center justify-center ${system.bgColor} ${system.textColor} ${className}`}>
      <Icon className={s.icon} />
    </span>
  );
};
