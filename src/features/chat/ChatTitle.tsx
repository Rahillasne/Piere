import { Input } from '@/ui/input';
import { useState, useEffect, useRef } from 'react';
import { useConversation } from '@/services/conversationService';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export function ChatTitle() {
  const { conversation, updateConversation } = useConversation();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(conversation.title);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep local state in sync when switching conversations quickly
  useEffect(() => {
    setTitleInput(conversation.title);
    // Don't reset isEditingTitle here to allow animation to complete if triggered externally
  }, [conversation.id, conversation.title]);

  const handleTitleSave = () => {
    if (titleInput.trim() === '' || titleInput.trim() === conversation.title) {
      setTitleInput(conversation.title);
      setIsEditingTitle(false);
      return;
    }

    updateConversation?.(
      {
        ...conversation,
        title: titleInput.trim(),
      },
      {
        onSettled() {
          setIsEditingTitle(false);
        },
        onError(error) {
          console.error('Error updating title:', error);
          setTitleInput(conversation.title); // Revert on error
          setIsEditingTitle(false); // Or keep editing, TBD by UX preference
        },
      },
    );
  };

  const animationProps = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.12 },
  };

  const handleInputAnimationComplete = () => {
    if (isEditingTitle) {
      inputRef.current?.select();
    }
  };

  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        {isEditingTitle ? (
          <motion.div
            key="editing-title-input"
            className="h-8 w-full"
            {...animationProps}
            onAnimationComplete={handleInputAnimationComplete}
          >
            <div className="flex h-8 w-full items-center gap-2">
              <Input
                ref={inputRef}
                className={cn(
                  'h-8 w-full bg-transparent px-2 text-left text-[17px] font-medium leading-tight tracking-tight text-pierre-neutral-10 selection:bg-pierre-blue/50 selection:text-white',
                  'rounded-none border-x-0 border-b-2 border-t-0 border-pierre-neutral-500',
                  'focus:border-pierre-neutral-500 focus:outline-none focus:ring-0',
                )}
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleTitleSave();
                  } else if (e.key === 'Escape') {
                    setTitleInput(conversation.title);
                    setIsEditingTitle(false);
                  }
                }}
                onBlur={handleTitleSave}
                autoFocus
              />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="display-title"
            className="h-8 w-full"
            {...animationProps}
          >
            <div className="flex h-8 w-fit items-center rounded font-medium tracking-tight text-pierre-neutral-10 transition-colors duration-200 hover:bg-black hover:text-pierre-neutral-0">
              <span
                className={cn(
                  'line-clamp-1 cursor-pointer px-2 text-center text-[17px]',
                )}
                onClick={() => setIsEditingTitle(true)}
              >
                {conversation.title || 'Chat'}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
