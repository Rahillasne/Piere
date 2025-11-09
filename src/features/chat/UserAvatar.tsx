import { Avatar, AvatarFallback, AvatarImage } from '@/ui/avatar';
import { User as FirebaseUser } from 'firebase/auth';
import { useState } from 'react';

interface UserAvatarProps {
  className?: string;
  firebaseUser?: FirebaseUser | null;
}

export function UserAvatar({ className, firebaseUser }: UserAvatarProps) {
  const [imageLoadError, setImageLoadError] = useState(false);

  // Get user's initials for fallback
  const getUserInitial = () => {
    if (firebaseUser?.displayName) {
      return firebaseUser.displayName[0].toUpperCase();
    }
    if (firebaseUser?.email) {
      return firebaseUser.email[0].toUpperCase();
    }
    return 'U';
  };

  return (
    <Avatar className={className}>
      {firebaseUser?.photoURL && !imageLoadError ? (
        <AvatarImage
          src={firebaseUser.photoURL}
          alt={firebaseUser.displayName || 'User'}
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
          onError={() => setImageLoadError(true)}
        />
      ) : null}
      <AvatarFallback>{getUserInitial()}</AvatarFallback>
    </Avatar>
  );
}
