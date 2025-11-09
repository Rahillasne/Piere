import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Message } from '@shared/types';
import { useConversation } from '@/services/conversationService';
import { useCurrentMessage } from '@/core/CurrentMessageContext';
import { useMessagesQuery } from '@/services/messageService';
import Tree from '@shared/Tree';
import {
  ImperativePanelHandle,
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from 'react-resizable-panels';
import { ChatSection } from '@/features/chat/ChatSection';
import { Button } from '@/ui/button';
import { ChevronsRight } from 'lucide-react';
import { ViewerSection } from '@/features/viewer/ViewerSection';
import { ParameterSection } from '@/features/parameters/ParameterSection';
import { useBlob } from '@/core/BlobContext';
import { useColor } from '@/core/ColorContext';

const PANEL_SIZES = {
  CHAT: {
    DEFAULT: 20,
    MIN: 384,
    MAX: 550,
  },
  PREVIEW: {
    DEFAULT: 50,
    MIN: 20,
  },
  PARAMETERS: {
    DEFAULT: 30,
    MIN: 320,
    MAX: 384,
  },
} as const;

export function ParametricEditor() {
  const { conversation } = useConversation();
  const { currentMessage, setCurrentMessage } = useCurrentMessage();
  const { setBlob } = useBlob();
  const { setColor } = useColor();
  const [isParametersPanelCollapsed, setIsParametersPanelCollapsed] =
    useState(false);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const chatPanelRef = useRef<ImperativePanelHandle>(null);
  const parameterPanelRef = useRef<ImperativePanelHandle>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const { data: messages = [] } = useMessagesQuery();

  const lastMessage = useMemo(() => {
    if (conversation.current_message_leaf_id) {
      return messages.find(
        (msg) => msg.id === conversation.current_message_leaf_id,
      );
    }
    return messages[messages.length - 1];
  }, [messages, conversation.current_message_leaf_id]);

  const messageTree = useMemo(() => {
    return new Tree<Message>(messages);
  }, [messages]);

  const currentMessageBranch = useMemo(() => {
    return messageTree.getPath(lastMessage?.id ?? '');
  }, [lastMessage, messageTree]);

  useEffect(() => {
    currentMessageBranch.forEach((message) => {
      if (message.id === currentMessage?.id) {
        setCurrentMessage(message);
      }
    });
  }, [currentMessageBranch, currentMessage, setCurrentMessage]);

  useEffect(() => {
    setCurrentMessage(null);
    setBlob(null);
    setColor('#00A6FF');
  }, [conversation.id, setCurrentMessage, setBlob, setColor]);

  useEffect(() => {
    if (lastMessage?.role === 'assistant') {
      setCurrentMessage(lastMessage);
    }
  }, [lastMessage, setCurrentMessage]);

  // Update container width on resize
  const setContainerRef = useCallback((element: HTMLDivElement) => {
    // Initial measurement
    setContainerWidth(element.offsetWidth);

    // Create ResizeObserver to watch for container size changes
    resizeObserverRef.current = new ResizeObserver(() => {
      setContainerWidth(element.offsetWidth);
    });
    resizeObserverRef.current.observe(element);
    return () => {
      // Cleanup when element is removed
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
    };
  }, []);

  // Calculate panel sizes based on container width
  const chatPanelSizes = useMemo(() => {
    if (containerWidth === 0)
      return { defaultSize: 20, minSize: 15, maxSize: 40 };

    const minSize = (PANEL_SIZES.CHAT.MIN / containerWidth) * 100;
    const maxSize = (PANEL_SIZES.CHAT.MAX / containerWidth) * 100;
    const defaultSize = Math.min(
      Math.max(PANEL_SIZES.CHAT.DEFAULT, minSize),
      maxSize,
    );
    return {
      defaultSize,
      minSize,
      maxSize,
    };
  }, [containerWidth]);

  const parametersPanelSizes = useMemo(() => {
    if (containerWidth === 0)
      return { defaultSize: 25, minSize: 15, maxSize: 30 };

    // Calculate space taken by other panels at their minimums
    const chatMinPixels = PANEL_SIZES.CHAT.MIN;
    const previewMinPixels = (PANEL_SIZES.PREVIEW.MIN / 100) * containerWidth;
    const availableForParameters =
      containerWidth - chatMinPixels - previewMinPixels;

    // Use the smaller of our desired max (308px) or available space
    const maxPixelsAvailable = Math.min(
      PANEL_SIZES.PARAMETERS.MAX,
      availableForParameters,
    );

    const minSize = (PANEL_SIZES.PARAMETERS.MIN / containerWidth) * 100;
    const maxSize = (maxPixelsAvailable / containerWidth) * 100;
    const defaultSize = Math.min(
      Math.max(PANEL_SIZES.PARAMETERS.DEFAULT, minSize),
      maxSize,
    );

    return {
      defaultSize,
      minSize,
      maxSize,
    };
  }, [containerWidth]);

  const hasArtifact = useMemo(
    () => !!currentMessage?.content.artifact,
    [currentMessage],
  );

  // Clear corrupted panel state on mount to prevent "Panel data not found" errors
  useEffect(() => {
    // Only run once on mount
    const hasCleared = sessionStorage.getItem('panel-state-cleared-v6');
    if (!hasCleared) {
      localStorage.removeItem('editor-panels');
      localStorage.removeItem('editor-panels-2');
      localStorage.removeItem('editor-panels-3');
      sessionStorage.setItem('panel-state-cleared-v6', 'true');
    }
  }, []);

  // Ensure chat panel is expanded on mount
  useEffect(() => {
    const panel = chatPanelRef.current;
    if (panel && panel.isCollapsed()) {
      panel.expand();
      setIsChatCollapsed(false);
    }
  }, []);

  // Optimized collapse/expand handlers
  const handleChatCollapse = useCallback(() => {
    const panel = chatPanelRef.current;
    if (panel) {
      panel.collapse();
      setIsChatCollapsed(true);
    }
  }, []);

  const handleChatExpand = useCallback(() => {
    const panel = chatPanelRef.current;
    if (panel) {
      panel.expand();
      setIsChatCollapsed(false);
    }
  }, []);

  const handleParametersCollapse = useCallback(() => {
    const panel = parameterPanelRef.current;
    if (panel) {
      panel.collapse();
      setIsParametersPanelCollapsed(true);
    }
  }, []);

  const handleParametersExpand = useCallback(() => {
    const panel = parameterPanelRef.current;
    if (panel) {
      panel.expand();
      setIsParametersPanelCollapsed(false);
    }
  }, []);

  return (
    <div
      className="flex h-full w-full overflow-hidden bg-[#292828]"
      ref={setContainerRef}
    >
      <PanelGroup
        direction="horizontal"
        className="h-full w-full"
        autoSaveId="editor-panels"
      >
        <Panel
          collapsible
          ref={chatPanelRef}
          defaultSize={chatPanelSizes.defaultSize}
          minSize={chatPanelSizes.minSize}
          maxSize={chatPanelSizes.maxSize}
          id="chat-panel"
          order={0}
        >
          <div className="relative h-full">
            <ChatSection messages={currentMessageBranch ?? []} />
          </div>
        </Panel>
        <PanelResizeHandle className="resize-handle group relative">
          {!isChatCollapsed && (
            <div className="absolute left-1 top-1/2 z-50 -translate-y-1/2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <Button
                variant="ghost"
                className="rounded-l-none rounded-r-lg border-b border-r border-t border-gray-200/20 bg-pierre-bg-secondary-dark p-2 text-pierre-text-primary transition-colors dark:border-gray-800 [@media(hover:hover)]:hover:bg-pierre-neutral-950 [@media(hover:hover)]:hover:text-pierre-neutral-10"
                onClick={handleChatCollapse}
              >
                <ChevronsRight className="h-5 w-5 rotate-180" />
              </Button>
            </div>
          )}
          {isChatCollapsed && (
            <div className="absolute left-0 top-1/2 z-50 -translate-y-1/2">
              <Button
                aria-label="Expand chat panel"
                onClick={handleChatExpand}
                className="flex h-[100px] w-9 flex-col items-center rounded-l-none rounded-r-lg bg-pierre-bg-secondary-dark px-1.5 py-2 text-pierre-text-primary"
              >
                <ChevronsRight className="h-5 w-5 text-white" />
                <div className="flex flex-1 items-center justify-center">
                  <span className="rotate-90 transform text-center text-base font-semibold text-white">
                    Chat
                  </span>
                </div>
              </Button>
            </div>
          )}
        </PanelResizeHandle>
        <Panel
          defaultSize={PANEL_SIZES.PREVIEW.DEFAULT}
          minSize={PANEL_SIZES.PREVIEW.MIN}
          id="preview-panel"
          order={1}
        >
          <ViewerSection />
        </Panel>
        {hasArtifact && (
          <>
            <PanelResizeHandle className="resize-handle group relative">
              {!isParametersPanelCollapsed && (
                <div className="absolute right-1 top-1/2 z-50 -translate-y-1/2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    className="rounded-l-lg rounded-r-none border-b border-l border-t border-gray-200/20 bg-pierre-bg-secondary-dark p-2 text-pierre-text-primary transition-colors dark:border-gray-800 [@media(hover:hover)]:hover:bg-pierre-neutral-950 [@media(hover:hover)]:hover:text-pierre-neutral-10"
                    onClick={handleParametersCollapse}
                  >
                    <ChevronsRight className="h-5 w-5" />
                  </Button>
                </div>
              )}
              {isParametersPanelCollapsed && (
                <div className="absolute right-0 top-1/2 z-50 -translate-y-1/2">
                  <Button
                    aria-label="Expand parameters panel"
                    onClick={handleParametersExpand}
                    className="flex h-[140px] w-9 flex-col items-center rounded-l-lg rounded-r-none bg-pierre-bg-secondary-dark p-2 px-1.5 py-2 text-pierre-text-primary"
                  >
                    <ChevronsRight className="mb-3 h-5 w-5 rotate-180 text-white" />
                    <div className="flex flex-1 items-center justify-center">
                      <span className="min-w-[100px] -rotate-90 transform text-center text-base font-semibold text-white">
                        Parameters
                      </span>
                    </div>
                  </Button>
                </div>
              )}
            </PanelResizeHandle>
            <Panel
              collapsible
              ref={parameterPanelRef}
              defaultSize={parametersPanelSizes.defaultSize}
              minSize={parametersPanelSizes.minSize}
              maxSize={parametersPanelSizes.maxSize}
              id="parameters-panel"
              order={2}
            >
              <div className="relative h-full">
                <ParameterSection />
              </div>
            </Panel>
          </>
        )}
      </PanelGroup>
    </div>
  );
}
