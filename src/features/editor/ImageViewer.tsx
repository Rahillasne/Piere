import { Check, DownloadIcon, Frown, Loader2, PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useItemSelection } from '@/hooks/useItemSelection';
import { cn } from '@/lib/utils';
import { useConversation } from '@/services/conversationService';
import { getSafeFilename } from '@/utils/file-utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export function ImageViewer({
  image,
  className,
  hoverable = true,
  clickable = true,
}: {
  image: string;
  className?: string;
  hoverable?: boolean;
  clickable?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const { images, selectItem } = useItemSelection();
  const { conversation } = useConversation();

  const { data: imageUrl, isLoading: isImageLoading } = useQuery({
    queryKey: ['image', conversation.user_id, conversation.id, image],
    enabled: !!image,
    queryFn: async () => {
      const reader = new FileReader();
      const { data } = await supabase.storage
        .from('images')
        .download(`${conversation.user_id}/${conversation.id}/${image}`);
      if (!data) {
        throw new Error('Failed to download image');
      }
      const urlPromise = new Promise((resolve) => {
        reader.onload = () => {
          resolve(reader.result as string);
        };
      });
      reader.readAsDataURL(data);
      const url = (await urlPromise) as string;
      return { image, url };
    },
  });

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = imageUrl?.url || '';
    const name = getSafeFilename(conversation.title);
    link.download = `${name}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isSelected = useMemo(
    () => images.some((img) => img.id === image),
    [images, image],
  );

  if (isImageLoading) {
    return (
      <div
        className={cn(
          'flex aspect-square w-full items-center justify-center rounded-lg text-pierre-text-primary',
          className,
        )}
      >
        <Loader2 className="h-10 w-10 animate-spin" />
      </div>
    );
  }

  if (!imageUrl) {
    return (
      <div
        className={cn(
          'flex aspect-square h-full w-full items-center justify-center rounded-lg text-pierre-text-primary',
          className,
        )}
      >
        <Frown className="h-10 w-10" />
        <span>Image not found</span>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div
        className={cn(
          'group relative flex w-full max-w-2xl items-center justify-center overflow-hidden rounded-lg',
          className,
        )}
      >
        <img
          className="h-full w-full object-cover"
          src={imageUrl.url}
          alt="Image"
          onLoad={() => setLoaded(true)}
        />
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-pierre-neutral-800/50 text-pierre-text-primary">
            <Loader2 className="h-10 w-10 animate-spin" />
          </div>
        )}
        {clickable && (
          <>
            {/* Bottom shadow gradient that appears on hover */}
            <div
              className={`absolute inset-x-0 bottom-0 h-16 transition-opacity duration-300 ${hoverable ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}
              style={{
                background:
                  'linear-gradient(to top, rgba(0,0,0,0.48) 0%, rgba(0,0,0,0) 100%)',
              }}
            />
            {/* White download icon that appears on hover */}
            <div
              className={`absolute bottom-3 right-3 z-10 cursor-pointer transition-transform duration-200 hover:scale-110 ${hoverable ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}
              onClick={handleDownload}
            >
              <DownloadIcon className="h-5 w-5 text-white drop-shadow-[0px_2px_3px_rgba(0,0,0,0.4)]" />
            </div>
            {/* Selected Image Checkbox */}
            <div
              className={`absolute left-2 top-2 z-10 rounded-full p-1 ${isSelected ? 'bg-pierre-blue' : 'bg-black'} cursor-pointer transition-transform duration-200 hover:scale-110 ${isSelected ? 'opacity-100' : hoverable ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}
              onClick={(e) => {
                e.stopPropagation();
                selectItem({
                  id: image,
                  source: 'selection',
                  url: imageUrl.url,
                });
              }}
            >
              {isSelected && <Check className="h-4 w-4 text-white" />}
              {!isSelected && <PlusIcon className="h-4 w-4 text-white" />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
