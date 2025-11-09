import { useRef, useState } from 'react';
import { Message } from '@shared/types';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Copy,
  Pencil,
  X,
  Wrench,
  FileBox,
} from 'lucide-react';
import { Button } from '@/ui/button';
import { Separator } from '@/ui/separator';
import { Textarea } from '@/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/ui/tooltip';
import { cn } from '@/lib/utils';
import { useConversation } from '@/services/conversationService';
import { useCurrentMessage } from '@/core/CurrentMessageContext';
import { ImageViewer } from '@/features/editor/ImageViewer';
import { TreeNode } from '@shared/Tree';
import { UserAvatar } from '@/features/chat/UserAvatar';
import { useEditMessageMutation } from '@/services/messageService';
import { User as FirebaseUser } from 'firebase/auth';

interface UserMessageProps {
  isLoading: boolean;
  message: TreeNode<Message>;
  firebaseUser?: FirebaseUser | null;
}

export function UserMessage({ message, isLoading, firebaseUser }: UserMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [copied, setCopied] = useState(false);
  const [input, setInput] = useState(message.content.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { conversation, updateConversation } = useConversation();
  const { mutate: editMessage } = useEditMessageMutation();

  const changeLeaf = (messageId: string) => {
    updateConversation({
      ...conversation,
      current_message_leaf_id: messageId,
    });
  };

  const branchIndex = message.siblings.findIndex(
    (branch) => branch.id === message.id,
  );

  const leafNodes = message.siblings.map((branch) => {
    let current = branch;
    while (current.children && current.children.length > 0) {
      current = current.children[0];
    }
    return current;
  });

  const handleEdit = () => {
    editMessage({
      ...message,
      content: {
        ...message.content,
        text: input,
      },
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setInput(message.content.text);
    setIsEditing(false);
  };

  const handleMouseEnter = () => {
    setHovering(true);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleMouseLeave = () => {
    setHovering(false);
    setCopied(false);
  };

  const handleCopy = () => {
    if (message.content.text) {
      navigator.clipboard.writeText(message.content.text);
      setCopied(true);
    }
  };

  return (
    <div className="flex justify-start">
      {message.role === 'user' && (
        <div className="mr-2 mt-1">
          <UserAvatar
            className="h-9 w-9 border border-pierre-neutral-700 bg-pierre-neutral-950 p-0"
            firebaseUser={firebaseUser}
          />
        </div>
      )}
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="relative flex flex-col gap-1"
      >
        {message.content.error ? (
          <div className="rounded-lg bg-pierre-bg-secondary-dark">
            <div
              className={cn(
                'group relative flex items-center gap-2 rounded-lg border',
                'bg-gradient-to-br from-pierre-blue/20 to-pierre-neutral-800/70 p-3',
                'border-pierre-blue/30 text-pierre-text-primary',
                'transition-all duration-300 ease-in-out',
                'hover:border-pierre-blue/30 hover:bg-pierre-blue/20 hover:text-white',
                'focus:outline-none focus:ring-2 focus:ring-pierre-blue/20',
              )}
            >
              <Wrench className="h-4 w-4 transition-all duration-300 group-hover:rotate-12" />
              <span className="text-xs">Fix with AI</span>
            </div>
            {hovering && message.siblings.length > 1 && (
              <div className="absolute bottom-[-1.5rem] right-2 flex items-center gap-0.5 rounded-sm border border-pierre-neutral-700 bg-pierre-bg-secondary-dark p-0.5">
                <BranchNavigation
                  branches={message.siblings}
                  branchIndex={branchIndex}
                  isLoading={isLoading}
                  leafNodes={leafNodes}
                  changeLeaf={changeLeaf}
                />
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1">
              <UserMessageImagesViewer message={message} />
              <UserMessageStlFilesViewer message={message} />
            </div>
            {(isEditing || (input && input.length > 0)) && (
              <div
                className={cn(
                  'relative grid w-fit rounded-lg text-white',
                  (hovering || message.content.images || message.content.stl_files) && 'bg-pierre-neutral-800',
                )}
              >
                {isEditing && (
                  <Textarea
                    value={input}
                    ref={textareaRef}
                    onChange={(e) => {
                      setInput(e.target.value);
                    }}
                    className="block h-auto min-h-0 w-full resize-none overflow-hidden whitespace-pre-line break-words border-none bg-pierre-neutral-800 px-3 py-2 text-sm sm:px-4"
                    rows={1}
                    style={{ gridArea: '1 / -1' }}
                  />
                )}
                <div
                  className={cn(
                    'pointer-events-none col-start-1 row-start-1 overflow-hidden whitespace-pre-wrap break-words px-3 py-2 text-sm sm:px-4',
                    isEditing ? 'opacity-0' : '',
                  )}
                >
                  <span>{input}</span>
                  <br />
                </div>
              </div>
            )}
            {((hovering &&
              (message.content.text || message.siblings.length > 1)) ||
              isEditing) && (
              <div className="absolute bottom-[-1.5rem] right-2 flex items-center gap-0.5 rounded-sm border border-pierre-neutral-700 bg-pierre-bg-secondary-dark p-0.5">
                {!isEditing ? (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            'h-6 w-6 rounded-sm p-0',
                            isLoading
                              ? 'cursor-not-allowed opacity-50'
                              : 'hover:bg-pierre-neutral-800',
                          )}
                          onClick={() => {
                            setIsEditing(true);
                          }}
                          disabled={isLoading}
                        >
                          <Pencil className="h-3 w-3 p-0 text-pierre-neutral-100" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Edit</TooltipContent>
                    </Tooltip>
                    <Separator
                      orientation="vertical"
                      className="h-4 bg-pierre-neutral-700"
                    />
                    {message.content.text && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 rounded-sm p-0 hover:bg-pierre-neutral-800"
                            onClick={handleCopy}
                          >
                            {copied ? (
                              <Check className="h-3 w-3 p-0 text-pierre-neutral-100" />
                            ) : (
                              <Copy className="h-3 w-3 p-0 text-pierre-neutral-100" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Copy Prompt</TooltipContent>
                      </Tooltip>
                    )}
                    {message.siblings.length > 1 && (
                      <>
                        <Separator
                          orientation="vertical"
                          className="h-4 bg-pierre-neutral-700"
                        />
                        <BranchNavigation
                          branches={message.siblings}
                          branchIndex={branchIndex}
                          isLoading={isLoading}
                          leafNodes={leafNodes}
                          changeLeaf={changeLeaf}
                        />
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleEdit}
                      className="h-6 w-6 rounded-sm p-0 hover:bg-pierre-blue"
                    >
                      <Check className="h-3 w-3 p-0 text-pierre-neutral-100" />
                    </Button>
                    <Separator
                      orientation="vertical"
                      className="h-4 bg-pierre-neutral-700"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 rounded-sm p-0 hover:bg-pierre-neutral-800"
                      onClick={handleCancel}
                    >
                      <X className="h-3 w-3 p-0 text-pierre-neutral-100" />
                    </Button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Branch navigation component to eliminate code duplication
function BranchNavigation({
  branches,
  branchIndex,
  isLoading,
  leafNodes,
  changeLeaf,
}: {
  branches: TreeNode<Message>[];
  branchIndex: number;
  isLoading: boolean;
  leafNodes: TreeNode<Message>[];
  changeLeaf: (messageId: string) => void;
}) {
  if (branches.length <= 1) return null;

  return (
    <div className="flex items-center gap-0.5">
      <Button
        disabled={branchIndex === 0 || isLoading}
        variant="ghost"
        size="icon"
        className="h-6 w-6 rounded-sm p-0 hover:bg-pierre-neutral-800"
        onClick={() => {
          changeLeaf(leafNodes[branchIndex - 1].id);
        }}
      >
        <ChevronLeft className="h-3 w-3 p-0 text-pierre-neutral-100" />
      </Button>
      <span className="text-xs tracking-widest text-pierre-neutral-100">
        {branchIndex + 1}/{branches.length}
      </span>
      <Button
        disabled={branchIndex === branches.length - 1 || isLoading}
        variant="ghost"
        size="icon"
        className="h-6 w-6 rounded-sm p-0 hover:bg-pierre-neutral-800"
        onClick={() => {
          changeLeaf(leafNodes[branchIndex + 1].id);
        }}
      >
        <ChevronRight className="h-3 w-3 p-0 text-pierre-neutral-100" />
      </Button>
    </div>
  );
}

/**
 * UserMessageImagesViewer is a component that displays a grid of images from a message.
 * It's used within UserMessage to show any images attached to a user's message.
 *
 * Features:
 * - Displays images in a responsive grid layout
 * - Supports hover effects to highlight images
 * - Allows clicking images to open them in a larger view
 * - Integrates with CurrentMessageContext to track which image is being viewed
 *
 * @param message - The message object containing the images to display
 */
export function UserMessageImagesViewer({ message }: { message: Message }) {
  const { currentMessage, setCurrentMessage } = useCurrentMessage();

  if (!message.content.images) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {message.content.images.map((image: string, index: number) => (
        <div
          key={`${image}-${index}`}
          onClick={() => {
            if (
              currentMessage &&
              message.id === currentMessage?.id &&
              currentMessage?.content.index === index
            ) {
              setCurrentMessage(null);
            } else {
              // Only set the images part of the message
              setCurrentMessage({
                ...message,
                content: {
                  images: message.content.images,
                  index,
                },
              });
            }
          }}
          className="h-24 w-24"
        >
          <ImageViewer
            image={image}
            className={cn(
              'aspect-square cursor-pointer',
              currentMessage?.id === message.id &&
                currentMessage?.content.index === index &&
                'outline outline-2 outline-pierre-blue',
            )}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * UserMessageStlFilesViewer is a component that displays STL files from a message.
 * It's used within UserMessage to show any STL files attached to a user's message.
 *
 * Features:
 * - Displays STL files with file icon and name
 * - Uses consistent styling with image viewer
 *
 * @param message - The message object containing the STL files to display
 */
export function UserMessageStlFilesViewer({ message }: { message: Message }) {
  if (!message.content.stl_files) {
    return null;
  }

  return (
    <>
      {message.content.stl_files.map((fileId: string, index: number) => (
        <div
          key={`${fileId}-${index}`}
          className="flex h-24 w-32 items-center gap-2 rounded-lg bg-pierre-neutral-800 px-3 py-2"
        >
          <FileBox className="h-6 w-6 flex-shrink-0 text-pierre-blue" />
          <div className="flex flex-col overflow-hidden">
            <span className="truncate text-xs text-pierre-text-primary">
              {fileId.split('/').pop() || 'model.stl'}
            </span>
            <span className="text-[10px] text-pierre-text-secondary">STL File</span>
          </div>
        </div>
      ))}
    </>
  );
}
