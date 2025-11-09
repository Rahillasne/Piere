import { useConversation } from '@/services/conversationService';
import { supabase } from '@/lib/supabase';
import {
  Content,
  Conversation,
  Message,
  Model,
  Parameter,
} from '@shared/types';
import { HistoryConversation } from '@/types/misc';
import {
  QueryClient,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { updateParameter } from '@/utils/parameterUtils';
import { useCallback } from 'react';

function messageSentConversationUpdate(
  newMessage: Message,
  conversationId: string,
) {
  return (
    oldConversations: Conversation[] | HistoryConversation[] | undefined,
  ) => {
    if (!oldConversations) return oldConversations;
    return oldConversations
      .map((conv) => {
        if (conv.id === conversationId) {
          return {
            ...conv,
            current_message_leaf_id: newMessage.id,
            updated_at: newMessage.created_at,
          };
        }
        return conv;
      })
      .sort((a: Conversation, b: Conversation) => {
        return (
          new Date(b.updated_at ?? '').getTime() -
          new Date(a.updated_at ?? '').getTime()
        );
      });
  };
}

function messageInsertedConversationUpdate(
  queryClient: QueryClient,
  newMessage: Message,
  conversationId: string,
) {
  // Update the current conversation optimistically
  queryClient.setQueryData(
    ['conversation', conversationId],
    (oldConversation: Conversation) => ({
      ...oldConversation,
      current_message_leaf_id: newMessage.id,
    }),
  );

  // Update messages optimistically
  queryClient.setQueryData(
    ['messages', conversationId],
    (oldMessages: Message[] | undefined) => {
      if (!oldMessages || oldMessages.length === 0) return [newMessage];
      if (oldMessages.find((msg) => msg.id === newMessage.id)) {
        return oldMessages.map((msg) =>
          msg.id === newMessage.id ? newMessage : msg,
        );
      }
      return [...oldMessages, newMessage];
    },
  );

  // Update conversations list optimistically instead of invalidating
  queryClient.setQueryData(
    ['conversations'],
    messageSentConversationUpdate(newMessage, conversationId),
  );

  // Also update the recent conversations in sidebar
  queryClient.setQueryData(
    ['conversations', 'recent'],
    messageSentConversationUpdate(newMessage, conversationId),
  );
}

export const useMessagesQuery = () => {
  const { conversation } = useConversation();
  return useQuery<Message[]>({
    enabled: !!conversation.id,
    queryKey: ['messages', conversation.id],
    initialData: [],
    queryFn: async () => {
      const { data: messagesData, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true })
        .overrideTypes<
          Array<{ content: Content; role: 'user' | 'assistant' }>
        >();

      if (messagesError) throw messagesError;

      return messagesData || [];
    },
  });
};

export function useInsertMessageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      message: Omit<Message, 'id' | 'created_at' | 'rating'>,
    ) => {
      const { data, error } = await supabase
        .from('messages')
        .insert([{ ...message }])
        .select()
        .single()
        .overrideTypes<{ content: Content; role: 'user' | 'assistant' }>();

      if (error) throw error;

      return data;
    },
    onSuccess(newMessage) {
      messageInsertedConversationUpdate(
        queryClient,
        newMessage,
        newMessage.conversation_id,
      );
    },
    onError(error) {
      console.error(error);
    },
  });
}

export function useParametricChatMutation({
  conversationId,
}: {
  conversationId: string;
}) {
  const queryClient = useQueryClient();
  const { mutateAsync: insertMessageAsync } = useInsertMessageMutation();

  return useMutation({
    mutationKey: ['parametric-chat', conversationId],
    mutationFn: async ({
      model,
      messageId,
      conversationId,
    }: {
      model: Model;
      messageId: string;
      conversationId: string;
    }) => {
      const newMessageId = crypto.randomUUID();
      let initialized = false;

      // Start streaming request
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${
              (await supabase.auth.getSession()).data.session?.access_token
            }`,
          },
          body: JSON.stringify({
            conversationId,
            messageId,
            model,
            newMessageId,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Network response was not ok: ${response.status} ${response.statusText}`,
        );
      }

      if (response.headers.get('Content-Type')?.includes('application/json')) {
        const data = await response.json();
        if (data.message) {
          return data.message;
        } else {
          throw new Error('No message received');
        }
      }

      async function initialize() {
        // Cancel any pending queries and update conversation leaf ID
        await queryClient.cancelQueries({
          queryKey: ['conversation', conversationId],
        });
        queryClient.setQueryData(
          ['conversation', conversationId],
          (oldConversation: Conversation) => ({
            ...oldConversation,
            current_message_leaf_id: newMessageId,
          }),
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No reader available');
      }

      const decoder = new TextDecoder();
      let leftover = '';

      let finalMessage: Message | null = null;

      // Batched updates for better performance - update UI every 100ms instead of every chunk
      let pendingUpdate: Message | null = null;
      let updateTimer: ReturnType<typeof setTimeout> | null = null;

      const flushPendingUpdate = () => {
        if (pendingUpdate) {
          const update = pendingUpdate; // Store in local variable for TypeScript
          queryClient.setQueryData(
            ['messages', conversationId],
            (oldMessages: Message[] | undefined) => {
              if (!oldMessages || oldMessages.length === 0) {
                return [update];
              }
              if (oldMessages.find((msg) => msg.id === update.id)) {
                return oldMessages.map((msg) =>
                  msg.id === update.id ? update : msg,
                );
              } else {
                return [...oldMessages, update];
              }
            },
          );
          pendingUpdate = null;
        }
        if (updateTimer) {
          clearTimeout(updateTimer);
          updateTimer = null;
        }
      };

      const scheduleUpdate = (data: Message) => {
        pendingUpdate = data;

        // If there's no timer running, start one
        if (!updateTimer) {
          updateTimer = setTimeout(() => {
            flushPendingUpdate();
          }, 100); // Batch updates every 100ms for smooth streaming without excessive re-renders
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Append decoded chunk to leftover buffer
          leftover += decoder.decode(value, { stream: true });

          // Split into lines; keep the last partial line in leftover
          const lines = leftover.split('\n');
          leftover = lines.pop() ?? '';

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) continue;
            try {
              const data: Message = JSON.parse(line);

              finalMessage = data;

              // Schedule batched update instead of immediate update
              scheduleUpdate(data);

              if (!initialized) {
                await initialize();
                initialized = true;
              }
            } catch (parseError) {
              console.error('Error parsing streaming data:', parseError);
            }
          }
        }

        // Flush any pending updates before processing final message
        flushPendingUpdate();

        // Flush decoder and process any remaining buffered content
        const flushRemainder = decoder.decode();
        if (flushRemainder) leftover += flushRemainder;
        const tail = leftover.trim();
        if (tail) {
          try {
            const data: Message = JSON.parse(tail);
            finalMessage = data;
            // Update final message immediately since stream is complete
            queryClient.setQueryData(
              ['messages', conversationId],
              (oldMessages: Message[] | undefined) => {
                if (!oldMessages || oldMessages.length === 0) {
                  return [data];
                }
                if (oldMessages.find((msg) => msg.id === data.id)) {
                  return oldMessages.map((msg) =>
                    msg.id === data.id ? data : msg,
                  );
                } else {
                  return [...oldMessages, data];
                }
              },
            );
          } catch (parseError) {
            console.error('Error parsing final streaming data:', parseError);
          }
        }
      } finally {
        // Ensure any pending updates are flushed when stream ends
        flushPendingUpdate();
        reader.releaseLock();
      }

      if (!finalMessage) {
        throw new Error('No final message received');
      }

      return finalMessage;
    },
    onSuccess: async (newMessage) => {
      messageInsertedConversationUpdate(
        queryClient,
        newMessage,
        conversationId,
      );

      // Auto-update conversation title from first AI-generated artifact
      if (newMessage.content.artifact?.title) {
        // Get all messages in the conversation
        const messages = queryClient.getQueryData<Message[]>([
          'messages',
          conversationId,
        ]);

        // Check if this is the first assistant message (meaning only 2 messages total: 1 user + 1 assistant)
        const assistantMessages = messages?.filter(
          (msg) => msg.role === 'assistant',
        );

        if (assistantMessages && assistantMessages.length === 1) {
          // This is the first assistant response, update conversation title
          const conversation = queryClient.getQueryData<Conversation>([
            'conversation',
            conversationId,
          ]);

          if (conversation && conversation.title === 'New Conversation') {
            // Update the conversation title to match the artifact title
            const { error } = await supabase
              .from('conversations')
              .update({ title: newMessage.content.artifact.title })
              .eq('id', conversationId);

            if (!error) {
              // Update the cache
              queryClient.setQueryData(['conversation', conversationId], {
                ...conversation,
                title: newMessage.content.artifact.title,
              });

              // Invalidate conversations list to show updated title in sidebar
              queryClient.invalidateQueries({
                queryKey: ['conversations'],
              });
            }
          }
        }
      }
    },
    onError: async (error, { messageId }) => {
      console.error(error);
      try {
        await insertMessageAsync({
          role: 'assistant',
          content: {
            text: 'An error occurred while processing your request.',
          },
          parent_message_id: messageId,
          conversation_id: conversationId,
        });
      } catch (error) {
        console.error(error);
      }
    },
  });
}

export function useSendContentMutation({
  conversation,
}: {
  conversation: Pick<
    Conversation,
    'id' | 'current_message_leaf_id' | 'user_id'
  >;
}) {
  const { mutateAsync: insertMessageAsync } = useInsertMessageMutation();

  const { mutateAsync: sendToParametricChat } = useParametricChatMutation({
    conversationId: conversation.id,
  });

  return useMutation({
    mutationKey: ['send-content', conversation.id],
    mutationFn: async (content: Content) => {
      const userMessage = await insertMessageAsync({
        role: 'user',
        content,
        parent_message_id: conversation.current_message_leaf_id ?? null,
        conversation_id: conversation.id,
      });

      await sendToParametricChat({
        model: content.model ?? 'pierre',
        messageId: userMessage.id,
        conversationId: conversation.id,
      });
    },
  });
}

export function useUpdateMessageOptimisticMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ message }: { message: Message }) => {
      const { data: updatedMessage, error: messageError } = await supabase
        .from('messages')
        .update({
          // only content gets updated
          content: message.content,
        })
        .eq('id', message.id)
        .eq('conversation_id', message.conversation_id)
        .select()
        .single();

      if (messageError) throw messageError;

      return updatedMessage as Message;
    },
    onMutate: async ({ message }) => {
      await queryClient.cancelQueries({
        queryKey: ['messages', message.conversation_id],
      });
      const oldMessages = queryClient.getQueryData<Message[]>([
        'messages',
        message.conversation_id,
      ]);
      queryClient.setQueryData(
        ['messages', message.conversation_id],
        oldMessages?.map((msg) =>
          msg.id === message.id ? { ...msg, ...message } : msg,
        ),
      );
      return { oldMessages };
    },
    onSettled(_data, _error, { message }) {
      queryClient.invalidateQueries({
        queryKey: ['messages', message.conversation_id],
      });
    },
    onError(error, { message }, context) {
      console.error(error);
      queryClient.setQueryData(
        ['messages', message.conversation_id],
        context?.oldMessages,
      );
    },
  });
}

export function useEditMessageMutation() {
  const { conversation } = useConversation();

  const { mutateAsync: insertMessageAsync } = useInsertMessageMutation();

  const { mutateAsync: sendToParametricChat } = useParametricChatMutation({
    conversationId: conversation.id,
  });

  return useMutation({
    mutationKey: ['edit-message', conversation.id],
    mutationFn: async (updatedMessage: Message) => {
      const userMessage = await insertMessageAsync({
        role: updatedMessage.role,
        content: updatedMessage.content,
        parent_message_id: updatedMessage.parent_message_id ?? null,
        conversation_id: conversation.id,
      });

      sendToParametricChat({
        model: updatedMessage.content.model ?? 'pierre',
        messageId: userMessage.id,
        conversationId: conversation.id,
      });
    },
    onError: (error) => {
      console.error(error);
    },
  });
}

export function useRetryMessageMutation() {
  const { conversation, updateConversationAsync } = useConversation();

  const { mutateAsync: sendToParametricChat } = useParametricChatMutation({
    conversationId: conversation.id,
  });

  return useMutation({
    mutationKey: ['retry-message', conversation.id],
    mutationFn: async ({ model, id }: { model: Model; id: string }) => {
      if (!updateConversationAsync) {
        throw new Error('Cannot update conversation');
      }

      await updateConversationAsync({
        ...conversation,
        current_message_leaf_id: id,
      });

      sendToParametricChat({
        model: model,
        messageId: id,
        conversationId: conversation.id,
      });
    },
    onError: (error) => {
      console.error(error);
    },
  });
}

export function useRestoreMessageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      messageToRestore,
      currentLeafId,
    }: {
      messageToRestore: Message;
      currentLeafId: string | null;
    }) => {
      // Bring the old message forward as a new message, child of current leaf
      // This keeps all history intact while making the old version the new current
      const { data, error } = await supabase
        .from('messages')
        .insert([
          {
            role: messageToRestore.role,
            content: messageToRestore.content,
            parent_message_id: currentLeafId,
            conversation_id: messageToRestore.conversation_id,
          },
        ])
        .select()
        .single()
        .overrideTypes<{ content: Content; role: 'user' | 'assistant' }>();

      if (error) throw error;

      return data;
    },
    onSuccess(newMessage) {
      messageInsertedConversationUpdate(
        queryClient,
        newMessage,
        newMessage.conversation_id,
      );
    },
    onError: (error) => {
      console.error(error);
    },
  });
}

export function useChangeParameters() {
  const { mutate: updateMessageOptimistic } =
    useUpdateMessageOptimisticMutation();
  const queryClient = useQueryClient();
  const { conversation } = useConversation();

  return useCallback(
    (message: Message | null, updatedParameters: Parameter[]) => {
      if (!message) return;

      console.log('[useChangeParameters] Updating parameters:', {
        messageId: message.id,
        parameterCount: updatedParameters.length,
        parameters: updatedParameters.map(p => ({ name: p.name, value: p.value })),
      });

      const originalCode = message.content.artifact?.code ?? '';
      console.log('[useChangeParameters] Original code length:', originalCode.length);

      let newCode = originalCode;
      updatedParameters.forEach((param) => {
        if (param.name.length > 0) {
          console.log('[useChangeParameters] Updating param:', param.name);
          newCode = updateParameter(newCode, param);
        }
      });

      console.log('[useChangeParameters] Updated code length:', newCode.length);
      console.log('[useChangeParameters] Code changed:', originalCode !== newCode);

      const newContent: Content = {
        text: message.content.text ?? '',
        model: message.content.model ?? 'pierre',
        artifact: {
          title: message.content.artifact?.title ?? '',
          version: message.content.artifact?.version ?? '',
          code: newCode,
          parameters: updatedParameters,
        },
      };

      console.log('[useChangeParameters] ✅ Updating message in database');

      updateMessageOptimistic(
        {
          message: { ...message, content: newContent },
        },
        {
          onError(_error, _variables, context) {
            console.error('[useChangeParameters] ❌ Error updating message:', _error);
            if (context?.oldMessages) {
              queryClient.setQueryData(
                ['messages', conversation.id],
                context.oldMessages,
              );
            }
          },
        },
      );
    },
    [updateMessageOptimistic, queryClient, conversation.id],
  );
}

export function useIsLoading() {
  const { conversation } = useConversation();
  const isSendingChat = useIsMutating({
    mutationKey: ['parametric-chat', conversation.id],
  });
  const isSendingMessage = useIsMutating({
    mutationKey: ['send-content', conversation.id],
  });
  const isEditingMessage = useIsMutating({
    mutationKey: ['edit-message', conversation.id],
  });
  const isRetryingMessage = useIsMutating({
    mutationKey: ['retry-message', conversation.id],
  });
  const isSending =
    !!isSendingChat ||
    !!isSendingMessage ||
    !!isEditingMessage ||
    !!isRetryingMessage;
  return isSending;
}
