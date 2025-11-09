import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ParametricEditor } from '@/features/editor/ParametricEditor';
import { Message } from '@shared/types';
import { MessageItem } from '@/types/misc';
import { useEffect, useState } from 'react';
import { CurrentMessageContext } from '@/core/CurrentMessageContext';
import { SelectedItemsContext } from '@/core/SelectedItemsContext';
import { useConversation } from '@/services/conversationService';
import { BlobContext } from '@/core/BlobContext';
import { ColorContext } from '@/core/ColorContext';

export default function EditorView() {
  const { id: conversationId } = useParams();
  const [currentMessage, setCurrentMessage] = useState<Message | null>(null);
  const [images, setImages] = useState<MessageItem[]>([]);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [color, setColor] = useState<string>('#00A6FF');
  const navigate = useNavigate();
  const { conversation, isConversationLoading } = useConversation();

  useEffect(() => {
    if (!conversationId) {
      navigate('/');
    }
  }, [conversationId, navigate]);

  if (isConversationLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-pierre-bg-secondary-dark text-pierre-text-primary">
        <Loader2 className="h-10 w-10 animate-spin" />
      </div>
    );
  }

  if (!conversation.id) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-pierre-bg-secondary-dark text-pierre-text-primary">
        <span className="text-2xl font-medium">404</span>
        <span className="text-sm">Conversation not found</span>
      </div>
    );
  }

  return (
    <CurrentMessageContext.Provider
      value={{
        currentMessage,
        setCurrentMessage,
      }}
    >
      <BlobContext.Provider value={{ blob, setBlob }}>
        <ColorContext.Provider value={{ color, setColor }}>
          <SelectedItemsContext.Provider value={{ images, setImages }}>
            <ParametricEditor />
          </SelectedItemsContext.Provider>
        </ColorContext.Provider>
      </BlobContext.Provider>
    </CurrentMessageContext.Provider>
  );
}
