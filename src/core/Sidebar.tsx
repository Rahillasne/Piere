import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, MessageSquare, Mic, Clock, LogOut, History } from 'lucide-react';
import { Button } from '@/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/ui/tooltip';
import { useAuth } from '@/core/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { ConditionalWrapper } from './ConditionalWrapper';
import {
  getRecentItems,
  RecentItem,
} from '@/services/voiceSessionService';
import { formatRelativeTime, formatVoiceSessionTime } from '@/lib/dateUtils';
import { toast } from 'sonner';

interface SidebarProps {
  isSidebarOpen: boolean;
}

export function Sidebar({ isSidebarOpen }: SidebarProps) {
  const navigate = useNavigate();
  const { user, firebaseUser, signOut } = useAuth();
  const [imageLoadError, setImageLoadError] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Signed out successfully');
      navigate('/');
    } catch (error) {
      console.error('Sign out error:', error);
      toast.error('Failed to sign out');
    }
  };

  // Get recent items (mix of conversations and voice sessions) - limit to 10
  const { data: recentItems = [] } = useQuery<RecentItem[]>({
    queryKey: ['sidebar', 'recent', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return getRecentItems(user.id, 10);
    },
    enabled: !!user?.id,
  });

  return (
    <div
      className={`${isSidebarOpen ? 'w-64' : 'w-16'} flex h-full flex-shrink-0 flex-col bg-pierre-bg-dark pb-2 transition-all duration-300 ease-in-out`}
    >
      {/* Logo */}
      <div className="p-4 dark:border-gray-800">
        <ConditionalWrapper
          condition={!isSidebarOpen}
          wrapper={(children) => (
            <Tooltip>
              <TooltipTrigger asChild>{children}</TooltipTrigger>
              <TooltipContent
                side="right"
                className="flex flex-col border-pierre-blue/40 bg-gradient-to-br from-pierre-neutral-900 to-pierre-neutral-950 px-3 py-2 shadow-[0_0_20px_rgba(79,133,255,0.3)]"
              >
                <span className="font-semibold text-pierre-text-primary">Home</span>
                <span className="text-xs text-pierre-neutral-300">Home Page</span>
              </TooltipContent>
            </Tooltip>
          )}
        >
          <Link to="/app">
            <div className="flex cursor-pointer items-center space-x-2">
              {isSidebarOpen ? (
                <div className="flex w-full">
                  <img
                    className="mx-auto h-8 w-full"
                    src="/pierre-logo-full.svg"
                    alt="Pierre Logo"
                  />
                </div>
              ) : (
                <img
                  src="/pierre-logo.svg"
                  alt="Pierre Logo"
                  className="h-8 w-8 min-w-8"
                />
              )}
            </div>
          </Link>
        </ConditionalWrapper>
      </div>

      {/* Main content area */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div
          className={`${isSidebarOpen ? 'px-4' : 'px-2'} flex-1 py-2 transition-all duration-300 ease-in-out`}
        >
          {isSidebarOpen ? (
            /* Expanded Sidebar: Show all action buttons */
            <div className="space-y-3 mb-6">
              {/* Create Conversation Button */}
              <Button
                variant="secondary"
                className="flex w-full items-center justify-start gap-2 rounded-[100px] border border-pierre-blue bg-pierre-background-1 px-4 py-3 text-[#D7D7D7] hover:bg-pierre-blue/40 hover:text-pierre-text-primary"
                onClick={() => navigate('/app')}
              >
                <Plus className="h-5 w-5" />
                <div className="text-sm font-semibold leading-[14px] tracking-[-0.14px] text-pierre-neutral-200">
                  Create Conversation
                </div>
              </Button>

              {/* Voice Brainstorm Button */}
              <Button
                variant="secondary"
                className="flex w-full items-center justify-start gap-2 rounded-[100px] border border-pierre-blue bg-pierre-background-1 px-4 py-3 text-[#D7D7D7] hover:bg-pierre-blue/40 hover:text-pierre-text-primary"
                onClick={() => navigate('/brainstorm')}
              >
                <Mic className="h-5 w-5" />
                <div className="text-sm font-semibold leading-[14px] tracking-[-0.14px] text-pierre-neutral-200">
                  Voice Brainstorm
                </div>
              </Button>

              {/* View All Conversations Button */}
              <Button
                variant="secondary"
                className="flex w-full items-center justify-start gap-2 rounded-[100px] border border-pierre-blue bg-pierre-background-1 px-4 py-3 text-[#D7D7D7] hover:bg-pierre-blue/40 hover:text-pierre-text-primary"
                onClick={() => navigate('/app/history')}
              >
                <History className="h-5 w-5" />
                <div className="text-sm font-semibold leading-[14px] tracking-[-0.14px] text-pierre-neutral-200">
                  View All Conversations
                </div>
              </Button>
            </div>
          ) : (
            /* Collapsed Sidebar: Show icon buttons with tooltips */
            <div className="space-y-2 mb-4">
              {/* Create Conversation Button */}
              <ConditionalWrapper
                condition={!isSidebarOpen}
                wrapper={(children) => (
                  <Tooltip>
                    <TooltipTrigger asChild>{children}</TooltipTrigger>
                    <TooltipContent
                      side="right"
                      className="flex flex-col border-pierre-blue/40 bg-gradient-to-br from-pierre-neutral-900 to-pierre-neutral-950 px-3 py-2 shadow-[0_0_20px_rgba(79,133,255,0.3)]"
                    >
                      <span className="font-semibold text-pierre-text-primary">Create Conversation</span>
                      <span className="text-xs text-pierre-neutral-300">
                        Start a new text conversation
                      </span>
                    </TooltipContent>
                  </Tooltip>
                )}
              >
                <div className="ml-[9px]">
                  <Button
                    variant="secondary"
                    className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border border-pierre-neutral-700/30 bg-[#191A1A] p-[2px] text-[#D7D7D7] transition-all duration-200 hover:scale-110 hover:border-pierre-blue/50 hover:bg-pierre-blue/60 hover:text-pierre-text-primary hover:shadow-[0_0_12px_rgba(79,133,255,0.4)]"
                    onClick={() => navigate('/app')}
                  >
                    <Plus className="h-5 w-5 text-pierre-neutral-200 transition-colors hover:text-pierre-text-primary" />
                  </Button>
                </div>
              </ConditionalWrapper>

              {/* Voice Brainstorm Button */}
              <ConditionalWrapper
                condition={!isSidebarOpen}
                wrapper={(children) => (
                  <Tooltip>
                    <TooltipTrigger asChild>{children}</TooltipTrigger>
                    <TooltipContent
                      side="right"
                      className="flex flex-col border-pierre-blue/40 bg-gradient-to-br from-pierre-neutral-900 to-pierre-neutral-950 px-3 py-2 shadow-[0_0_20px_rgba(79,133,255,0.3)]"
                    >
                      <span className="font-semibold text-pierre-text-primary">Voice Brainstorm</span>
                      <span className="text-xs text-pierre-neutral-300">
                        Talk through design ideas
                      </span>
                    </TooltipContent>
                  </Tooltip>
                )}
              >
                <div className="ml-[9px]">
                  <Button
                    variant="secondary"
                    className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border border-pierre-neutral-700/30 bg-[#191A1A] p-[2px] text-[#D7D7D7] transition-all duration-200 hover:scale-110 hover:border-pierre-blue/50 hover:bg-pierre-blue/60 hover:text-pierre-text-primary hover:shadow-[0_0_12px_rgba(79,133,255,0.4)]"
                    onClick={() => navigate('/brainstorm')}
                  >
                    <Mic className="h-5 w-5 text-pierre-neutral-200 transition-colors hover:text-pierre-text-primary" />
                  </Button>
                </div>
              </ConditionalWrapper>

              {/* View All Conversations Button */}
              <ConditionalWrapper
                condition={!isSidebarOpen}
                wrapper={(children) => (
                  <Tooltip>
                    <TooltipTrigger asChild>{children}</TooltipTrigger>
                    <TooltipContent
                      side="right"
                      className="flex flex-col border-pierre-blue/40 bg-gradient-to-br from-pierre-neutral-900 to-pierre-neutral-950 px-3 py-2 shadow-[0_0_20px_rgba(79,133,255,0.3)]"
                    >
                      <span className="font-semibold text-pierre-text-primary">View All</span>
                      <span className="text-xs text-pierre-neutral-300">
                        See all conversations
                      </span>
                    </TooltipContent>
                  </Tooltip>
                )}
              >
                <div className="ml-[9px]">
                  <Button
                    variant="secondary"
                    className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border border-pierre-neutral-700/30 bg-[#191A1A] p-[2px] text-[#D7D7D7] transition-all duration-200 hover:scale-110 hover:border-pierre-blue/50 hover:bg-pierre-blue/60 hover:text-pierre-text-primary hover:shadow-[0_0_12px_rgba(79,133,255,0.4)]"
                    onClick={() => navigate('/app/history')}
                  >
                    <History className="h-5 w-5 text-pierre-neutral-200 transition-colors hover:text-pierre-text-primary" />
                  </Button>
                </div>
              </ConditionalWrapper>
            </div>
          )}

          {/* Recent Conversations Section (for expanded sidebar only) */}
          {isSidebarOpen && recentItems.length > 0 && (
            <div className="mb-6">
              <div className="mb-2 flex items-center gap-2 px-2">
                <Clock className="h-4 w-4 text-pierre-text-secondary" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-pierre-text-secondary">
                  Recent Conversations
                </h3>
              </div>
              <div className="space-y-1">
                {recentItems.map((item) => (
                  <Link
                    key={item.id}
                    to={
                      item.type === 'conversation'
                        ? `/app/editor/${item.id}`
                        : `/brainstorm/${item.id}`
                    }
                  >
                    <div className="group cursor-pointer rounded-md px-2 py-2 transition-colors duration-200 hover:bg-pierre-neutral-950">
                      <div className="flex items-start gap-2">
                        {item.type === 'conversation' ? (
                          <MessageSquare className="mt-0.5 h-4 w-4 flex-shrink-0 text-pierre-text-secondary" />
                        ) : (
                          <Mic className="mt-0.5 h-4 w-4 flex-shrink-0 text-pierre-blue" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-pierre-text-primary group-hover:text-pierre-neutral-10">
                            {item.title}
                          </p>
                          <p className="text-xs text-pierre-text-secondary">
                            {item.type === 'voice_session' && item.durationSeconds
                              ? formatVoiceSessionTime(
                                  item.timestamp,
                                  item.durationSeconds,
                                )
                              : formatRelativeTime(item.timestamp)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* User profile and sign out section */}
      {firebaseUser && (
        <div className={`border-t border-white/5 ${isSidebarOpen ? 'p-4' : 'p-2'} transition-all duration-300 ease-in-out`}>
          <ConditionalWrapper
            condition={!isSidebarOpen}
            wrapper={(children) => (
              <Tooltip>
                <TooltipTrigger asChild>{children}</TooltipTrigger>
                <TooltipContent
                  side="right"
                  className="flex flex-col border-pierre-blue/40 bg-gradient-to-br from-pierre-neutral-900 to-pierre-neutral-950 px-3 py-2 shadow-[0_0_20px_rgba(79,133,255,0.3)]"
                >
                  <span className="font-semibold text-pierre-text-primary">Sign Out</span>
                  <span className="text-xs text-pierre-neutral-300">
                    {firebaseUser.email}
                  </span>
                </TooltipContent>
              </Tooltip>
            )}
          >
            <div>
              {isSidebarOpen ? (
                <div className="flex items-center gap-3">
                  {/* User Avatar */}
                  {firebaseUser.photoURL && !imageLoadError ? (
                    <img
                      src={firebaseUser.photoURL}
                      alt="User avatar"
                      className="h-10 w-10 rounded-full flex-shrink-0"
                      referrerPolicy="no-referrer"
                      crossOrigin="anonymous"
                      onError={() => setImageLoadError(true)}
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-pierre-blue/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-sm font-semibold">
                        {(firebaseUser.displayName || firebaseUser.email || 'U')[0].toUpperCase()}
                      </span>
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {firebaseUser.displayName || firebaseUser.email}
                    </p>
                    <p className="text-xs text-white/80 truncate">
                      {firebaseUser.email}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSignOut}
                    className="flex-shrink-0 h-8 w-8 p-0 text-white/60 hover:text-white hover:bg-white/5"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  onClick={handleSignOut}
                  className="w-full h-10 p-0 text-pierre-text-secondary hover:text-pierre-text-primary hover:bg-white/5"
                >
                  <LogOut className="h-5 w-5" />
                </Button>
              )}
            </div>
          </ConditionalWrapper>
        </div>
      )}
    </div>
  );
}
