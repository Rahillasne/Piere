import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Plus, Mic } from 'lucide-react';
import { ScrollArea } from '@/ui/scroll-area';
import { Button } from '@/ui/button';
import { Skeleton } from '@/ui/skeleton';
import { Input } from '@/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/tabs';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/core/AuthContext';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Content, Conversation } from '@shared/types';
import { HistoryConversation } from '@/types/misc';
import { ConversationCard } from '@/features/history/ConversationCard';
import { RenameDialogDrawer } from '@/features/history/RenameDialogDrawer';
import { getRecentVoiceSessionsWithDetails, VoiceSessionDisplay } from '@/services/voiceSessionService';
import { formatVoiceSessionTime } from '@/lib/dateUtils';

export function HistoryView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingConversation, setEditingConversation] =
    useState<Conversation | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleOpenChange = (open: boolean) => {
    setOpen(open);
    if (!open) {
      setEditingConversation(null);
    }
  };

  // Fetch text conversations
  const conversationQuery = useQuery<HistoryConversation[]>({
    queryKey: ['conversations'],
    enabled: !!user,
    queryFn: async () => {
      const { data: conversationsData, error: conversationsError } =
        await supabase
          .from('conversations')
          .select(
            `*, first_message:messages(content), messagesCount:messages(count)`,
          )
          .eq('user_id', user?.id ?? '')
          // Updated at is the primary sorting
          .order('updated_at', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1, { referencedTable: 'first_message' });

      if (conversationsError) throw conversationsError;

      const formattedConversations = conversationsData.map((conv) => {
        const rawContent = conv.first_message?.[0]?.content;
        const firstMessageContent =
          typeof rawContent === 'object' && rawContent !== null
            ? (rawContent as Content)
            : { text: '' };
        const messageCount = conv.messagesCount?.[0]?.count ?? 0;

        // Ensure first_message has both text and images if they exist
        const formattedFirstMessage = {
          text: firstMessageContent.text ?? '',
          images: firstMessageContent.images ?? [],
        };

        return {
          ...conv,
          created_at: conv.created_at || new Date().toISOString(),
          updated_at:
            conv.updated_at || conv.created_at || new Date().toISOString(),
          message_count: messageCount,
          first_message: formattedFirstMessage as Content,
        };
      });

      return formattedConversations;
    },
  });

  // Fetch voice sessions
  const voiceSessionsQuery = useQuery<VoiceSessionDisplay[]>({
    queryKey: ['voice_sessions', 'history'],
    enabled: !!user?.id,
    queryFn: async () => {
      if (!user?.id) return [];
      // Get all voice sessions (no limit for history view)
      return getRecentVoiceSessionsWithDetails(user.id, 1000);
    },
  });

  useEffect(() => {
    if (conversationQuery.isError) {
      toast({
        title: 'Error',
        description: 'Failed to load conversations',
        variant: 'destructive',
      });
    }
  }, [conversationQuery.isError, toast]);

  const deleteConversation = useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversationId);

      if (error) throw error;

      supabase.storage
        .from('images')
        .list(`${user?.id}/${conversationId}`)
        .then(({ data: list }) => {
          if (list) {
            const filesToRemove = list.map(
              (file) => `${user?.id}/${conversationId}/${file.name}`,
            );
            supabase.storage.from('images').remove(filesToRemove);
          }
        });
    },
    onMutate: async (conversationId) => {
      await queryClient.cancelQueries({ queryKey: ['conversations'] });
      const previousConversations = queryClient.getQueryData(['conversations']);
      queryClient.setQueryData(
        ['conversations'],
        (old: HistoryConversation[]) =>
          old.filter((conv) => conv.id !== conversationId),
      );
      return { previousConversations };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({
        title: 'Success',
        description: 'Conversation deleted successfully',
      });
    },
    onError: (error: unknown, _conversationId: string, context) => {
      console.error('Error deleting conversation:', error);
      queryClient.setQueryData(
        ['conversations'],
        context?.previousConversations,
      );
      toast({
        title: 'Error',
        description: 'Failed to delete conversation',
        variant: 'destructive',
      });
    },
  });

  const renameConversation = useMutation({
    mutationFn: async ({
      conversationId,
      newTitle,
    }: {
      conversationId: string;
      newTitle: string;
    }) => {
      const { error } = await supabase
        .from('conversations')
        .update({ title: newTitle })
        .eq('id', conversationId);

      if (error) throw error;
    },
    onMutate: async ({ conversationId, newTitle }) => {
      await queryClient.cancelQueries({ queryKey: ['conversations'] });
      const previousConversations = queryClient.getQueryData(['conversations']);
      queryClient.setQueryData(
        ['conversations'],
        (old: HistoryConversation[]) =>
          old.map((conv) =>
            conv.id === conversationId ? { ...conv, title: newTitle } : conv,
          ),
      );
      return { previousConversations };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({
        title: 'Success',
        description: 'Conversation renamed successfully',
      });
      setEditingConversation(null);
      setOpen(false);
    },
    onError: (error: unknown, _variables, context) => {
      console.error('Error renaming conversation:', error);
      queryClient.setQueryData(
        ['conversations'],
        context?.previousConversations,
      );
      toast({
        title: 'Error',
        description: 'Failed to rename conversation',
        variant: 'destructive',
      });
    },
  });

  const handleRename = () => {
    if (!editingConversation) return;
    if (!newTitle.trim()) {
      toast({
        title: 'Title cannot be empty',
        variant: 'default',
      });
      return;
    }
    renameConversation.mutate({
      conversationId: editingConversation.id,
      newTitle: newTitle.trim(),
    });
  };

  const filteredConversations =
    conversationQuery.data?.filter((conv: HistoryConversation) => {
      const messageText = conv.first_message.text ?? '';
      const title = conv.title?.toLowerCase() ?? '';
      const searchTerm = searchQuery.toLowerCase();

      return (
        title.includes(searchTerm) ||
        messageText.toLowerCase().includes(searchTerm)
      );
    }) ?? [];

  const filteredVoiceSessions =
    voiceSessionsQuery.data?.filter((session: VoiceSessionDisplay) => {
      const title = session.title?.toLowerCase() ?? '';
      const searchTerm = searchQuery.toLowerCase();
      return title.includes(searchTerm);
    }) ?? [];

  const groupConversationsByDate = () => {
    const groups: { [key: string]: HistoryConversation[] } = {};

    filteredConversations.forEach((conv: HistoryConversation) => {
      const localDate = new Date(
        conv.updated_at || conv.created_at,
      ).toLocaleDateString('en-CA');
      if (!groups[localDate]) {
        groups[localDate] = [];
      }
      groups[localDate].push(conv);
    });

    return groups;
  };

  const groupVoiceSessionsByDate = () => {
    const groups: { [key: string]: VoiceSessionDisplay[] } = {};

    filteredVoiceSessions.forEach((session: VoiceSessionDisplay) => {
      const localDate = new Date(
        session.started_at || session.created_at,
      ).toLocaleDateString('en-CA');
      if (!groups[localDate]) {
        groups[localDate] = [];
      }
      groups[localDate].push(session);
    });

    return groups;
  };

  const conversationGroups = groupConversationsByDate();
  const voiceSessionGroups = groupVoiceSessionsByDate();

  return (
    <>
      <div className="flex h-full min-w-0 flex-1 flex-col bg-pierre-background-1 pt-8 md:pt-0">
        <div className="mx-auto w-full max-w-6xl px-6 pb-4 pt-10 md:px-20 md:py-4">
          <div className="flex items-center justify-between py-3">
            <h1 className="flex items-center gap-2 px-2 text-2xl font-medium text-pierre-neutral-10">
              Past Creations
            </h1>
          </div>
          <div className="relative mt-4">
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-0 bg-pierre-background-2 pl-6 text-base shadow-[inset_0_0_10px_0_rgba(0,0,0,0.32),0_0_0_2px_rgba(0,0,0,0)] ring-0 transition-shadow duration-300 ease-in-out hover:shadow-[inset_0_0_4px_0_rgba(0,0,0,0.16),0_0_0_2px_rgba(60,60,60,1)] focus:shadow-[inset_0_0_4px_0_rgba(0,0,0,0.16),0_0_0_2px_#00A6FF] focus:outline-none sm:text-sm"
            />
          </div>
        </div>

        <Tabs defaultValue="text" className="flex-1 flex flex-col">
          <div className="mx-auto w-full max-w-6xl px-6 md:px-20">
            <TabsList className="bg-pierre-background-2 border border-pierre-neutral-800">
              <TabsTrigger value="text" className="gap-2 data-[state=active]:bg-pierre-blue/20 data-[state=active]:text-pierre-blue">
                <MessageSquare className="h-4 w-4" />
                Text Conversations ({filteredConversations.length})
              </TabsTrigger>
              <TabsTrigger value="voice" className="gap-2 data-[state=active]:bg-pierre-blue/20 data-[state=active]:text-pierre-blue">
                <Mic className="h-4 w-4" />
                Voice Sessions ({filteredVoiceSessions.length})
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Text Conversations Tab */}
          <TabsContent value="text" className="flex-1 m-0">
            <ScrollArea className="h-full">
              <div className="mx-auto w-full max-w-6xl px-6 md:px-20">
                {conversationQuery.isLoading ? (
                  <div className="space-y-4 py-4">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="flex items-center space-x-4">
                        <Skeleton className="h-12 w-12 rounded-lg" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-[250px]" />
                          <Skeleton className="h-4 w-[200px]" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredConversations.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center py-8 text-gray-500">
                    <MessageSquare className="mb-4 h-12 w-12 opacity-50" />
                    {searchQuery ? (
                      <>
                        <p className="mb-2 text-lg font-medium">
                          No matching conversations found
                        </p>
                        <p className="mb-4 text-sm">Try a different search term</p>
                      </>
                    ) : (
                      <>
                        <p className="mb-2 text-lg font-medium">
                          No conversations yet
                        </p>
                        <p className="mb-4 text-sm">
                          Start a new chat to begin building CAD
                        </p>
                        <Button onClick={() => navigate('/app')}>
                          Start New Chat
                        </Button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="space-y-8 py-4 pb-48">
                    {Object.entries(conversationGroups).map(([date, convs]) => {
                      let dateString;
                      try {
                        const [year, month, day] = date.split('-').map(Number);
                        dateString = format(
                          new Date(year, month - 1, day),
                          'MMMM d, yyyy',
                        );
                      } catch (error) {
                        console.error(error);
                      }

                      return (
                        <div key={date} className="space-y-2">
                          {dateString && (
                            <h2 className="bg-pierre-background-1 px-3 py-2 text-sm font-medium text-pierre-neutral-100">
                              {dateString}
                            </h2>
                          )}
                          <div className="space-y-2">
                            {convs.map((conversation) => (
                              <ConversationCard
                                key={conversation.id}
                                conversation={conversation}
                                onDelete={(id) => deleteConversation.mutate(id)}
                                onRename={(_id, title) => {
                                  setEditingConversation(conversation);
                                  setNewTitle(title);
                                  setOpen(true);
                                }}
                                isEditing={!!editingConversation}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Voice Sessions Tab */}
          <TabsContent value="voice" className="flex-1 m-0">
            <ScrollArea className="h-full">
              <div className="mx-auto w-full max-w-6xl px-6 md:px-20">
                {voiceSessionsQuery.isLoading ? (
                  <div className="space-y-4 py-4">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="flex items-center space-x-4">
                        <Skeleton className="h-12 w-12 rounded-lg" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-[250px]" />
                          <Skeleton className="h-4 w-[200px]" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredVoiceSessions.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center py-8 text-gray-500">
                    <Mic className="mb-4 h-12 w-12 opacity-50" />
                    {searchQuery ? (
                      <>
                        <p className="mb-2 text-lg font-medium">
                          No matching voice sessions found
                        </p>
                        <p className="mb-4 text-sm">Try a different search term</p>
                      </>
                    ) : (
                      <>
                        <p className="mb-2 text-lg font-medium">
                          No voice sessions yet
                        </p>
                        <p className="mb-4 text-sm">
                          Start a voice brainstorm session
                        </p>
                        <Button onClick={() => navigate('/brainstorm')}>
                          Start Voice Session
                        </Button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="space-y-8 py-4 pb-48">
                    {Object.entries(voiceSessionGroups).map(([date, sessions]) => {
                      let dateString;
                      try {
                        const [year, month, day] = date.split('-').map(Number);
                        dateString = format(
                          new Date(year, month - 1, day),
                          'MMMM d, yyyy',
                        );
                      } catch (error) {
                        console.error(error);
                      }

                      return (
                        <div key={date} className="space-y-2">
                          {dateString && (
                            <h2 className="bg-pierre-background-1 px-3 py-2 text-sm font-medium text-pierre-neutral-100">
                              {dateString}
                            </h2>
                          )}
                          <div className="space-y-2">
                            {sessions.map((session) => (
                              <div
                                key={session.id}
                                onClick={() => navigate(`/brainstorm/${session.id}`)}
                                className="group cursor-pointer rounded-lg border border-pierre-neutral-800 bg-pierre-background-2 p-4 transition-all duration-200 hover:border-pierre-blue hover:bg-pierre-background-1"
                              >
                                <div className="flex items-start gap-3">
                                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-pierre-blue/20">
                                    <Mic className="h-5 w-5 text-pierre-blue" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h3 className="text-base font-medium text-pierre-text-primary group-hover:text-pierre-blue truncate">
                                      {session.title}
                                    </h3>
                                    <p className="text-sm text-pierre-text-secondary mt-1">
                                      {formatVoiceSessionTime(session.started_at, session.durationSeconds)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>

      <RenameDialogDrawer
        open={open}
        onOpenChange={handleOpenChange}
        newTitle={newTitle}
        onNewTitleChange={setNewTitle}
        onRename={handleRename}
      />

      <button
        type="button"
        aria-label="Create new item"
        onClick={() => navigate('/')}
        className="fixed bottom-8 right-8 flex h-14 w-14 items-center justify-center rounded-full bg-pierre-neutral-100 text-pierre-neutral-950 shadow-[0_4px_32px_rgba(0,0,0,0.48)] md:hidden"
      >
        <Plus className="h-10 w-10 stroke-[2px]" />
      </button>
    </>
  );
}
