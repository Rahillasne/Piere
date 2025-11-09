import { useNavigate, useOutletContext } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/core/AuthContext';
import { supabase } from '@/lib/supabase';
import TextAreaChat from '@/features/chat/TextAreaChat';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useState, useMemo, useEffect } from 'react';
import { Content, Model } from '@shared/types';
import { MessageItem } from '@/types/misc';
import { cn } from '@/lib/utils';
import { SelectedItemsContext } from '@/core/SelectedItemsContext';
import { useSendContentMutation } from '@/services/messageService';

export function PromptView() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isLoading } = useAuth();
  const { isSidebarOpen } = useOutletContext<{ isSidebarOpen: boolean }>();
  const queryClient = useQueryClient();

  const [model, setModel] = useState<Model>('metroboomin');
  const [isLoaded, setIsLoaded] = useState(false);
  const [images, setImages] = useState<MessageItem[]>([]);

  const newConversationId = useMemo(() => {
    return crypto.randomUUID();
  }, []);

  const { mutate: sendMessage } = useSendContentMutation({
    conversation: {
      id: newConversationId,
      user_id: user?.id ?? '',
      current_message_leaf_id: null,
    },
  });

  // Trigger fade in on mount
  useEffect(() => {
    // Use requestAnimationFrame to ensure the initial render is complete
    const frame = requestAnimationFrame(() => {
      setIsLoaded(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // Helper function to get time-based greeting (memoized for performance)
  const getTimeBasedGreeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) {
      return 'Good morning';
    } else if (hour < 18) {
      return 'Good afternoon';
    } else {
      return 'Good evening';
    }
  }, []); // Empty dependency array means it only calculates once per page load

  const { mutate: handleGenerate } = useMutation({
    mutationFn: async (content: Content) => {
      // Create conversation with temporary title - will be updated after first AI response
      const { data: conversation, error: conversationError } = await supabase
        .from('conversations')
        .insert([
          {
            id: newConversationId,
            user_id: user?.id ?? '',
            title: 'New Conversation',
          },
        ])
        .select()
        .single();

      if (conversationError) throw conversationError;

      sendMessage(content);

      return {
        conversationId: conversation.id,
        conversation: conversation,
        content: content,
      };
    },
    onSuccess: (data) => {
      // Set the conversation data optimistically in cache - no need to refetch what we just created
      queryClient.setQueryData(['conversation', data.conversationId], data.conversation);

      // Pre-populate messages cache as empty array - prevents unnecessary fetch for new conversation
      queryClient.setQueryData(['messages', data.conversationId], []);

      // Optimistically add new conversation to sidebar recent items - prevents refetch
      queryClient.setQueryData(
        ['sidebar', 'recent', user?.id],
        (oldItems: any[] | undefined) => {
          const newItem = {
            id: data.conversation.id,
            type: 'conversation',
            title: data.conversation.title || 'New Conversation',
            timestamp: new Date(data.conversation.created_at || new Date().toISOString()),
          };

          // Add new conversation to the start of the list
          const items = oldItems ? [newItem, ...oldItems] : [newItem];

          // Keep only the most recent 10 items
          return items.slice(0, 10);
        },
      );

      // Navigate immediately - sidebar already updated optimistically
      navigate(`/app/editor/${data.conversationId}`);
    },
    onError: (error) => {
      console.error(error);
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to process prompt',
        variant: 'destructive',
      });
    },
  });

  return (
    <div
      className={cn(
        'relative h-full min-h-full transition-all duration-300 ease-in-out',
        isSidebarOpen && 'pb-6 pr-6 pt-6',
      )}
    >
      <div
        className={cn(
          'h-full min-h-full bg-pierre-bg-secondary-dark',
          isSidebarOpen && 'rounded-xl shadow-[0_0_15px_rgba(0,0,0,0.1)]',
        )}
      >
        <main className="w-full px-4 pt-14 sm:pt-12 md:px-8">
          <div className="mx-auto mt-20 flex max-w-3xl flex-col items-center justify-center">
            <h1
              className={cn(
                'mb-8 text-center text-2xl font-medium text-pierre-text-primary md:text-3xl lg:text-4xl',
                isLoaded ? 'opacity-100' : 'opacity-0',
              )}
            >
              {getTimeBasedGreeting}!
            </h1>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-full max-w-3xl space-y-4 pb-12">
              <SelectedItemsContext.Provider value={{ images, setImages }}>
                <TextAreaChat
                  onSubmit={handleGenerate}
                  conversation={{
                    id: newConversationId,
                    user_id: user?.id ?? '',
                  }}
                  placeholder="Start building with Pierre..."
                  model={model}
                  setModel={setModel}
                />
              </SelectedItemsContext.Provider>

              <div className="relative">
                {isLoading && (
                  <div className="absolute left-0 right-0 top-0">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-pierre-blue border-t-transparent" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
