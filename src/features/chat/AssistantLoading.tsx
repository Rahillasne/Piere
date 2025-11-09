import { Avatar, AvatarImage } from '@/ui/avatar';
import { AnimatedEllipsis } from '@/features/chat/AnimatedEllipsis';

export function AssistantLoading() {
  return (
    <div className="flex w-full p-1">
      <div className="mr-2 mt-1">
        <Avatar className="h-9 w-9 border border-pierre-neutral-700 bg-pierre-neutral-950 p-1.5">
          <AvatarImage
            src="/pierre-logo.svg"
            alt="Pierre"
          />
        </Avatar>
      </div>
      <div className="flex max-w-[80%] flex-col items-center justify-center gap-2 rounded-lg bg-pierre-neutral-800 p-3">
        <AnimatedEllipsis color="pierre-neutral" />
      </div>
    </div>
  );
}
