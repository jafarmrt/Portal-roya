import React from 'react';

interface AvatarProps {
  src?: string;
  firstName: string;
  lastName?: string;
  className?: string;
}

/** Profile photo with an initials fallback for colleagues without a picture. */
export const Avatar: React.FC<AvatarProps> = ({ src, firstName, lastName = '', className = 'w-10 h-10 rounded-full' }) => {
  if (src) return <img src={src} alt={`${firstName} ${lastName}`} className={`${className} object-cover bg-[#F5F2ED]`} />;
  const initials = `${firstName.charAt(0)}${lastName.charAt(0) ? `‌${lastName.charAt(0)}` : ''}`;
  return (
    <div
      aria-label={`${firstName} ${lastName}`}
      role="img"
      className={`${className} bg-red-100 text-red-800 font-black flex items-center justify-center select-none`}
    >
      <span className="text-[0.9em]">{initials}</span>
    </div>
  );
};
