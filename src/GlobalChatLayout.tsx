import { useState, useEffect, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import type { RootState } from "~/redux/store";
import { CopilotKit, useCopilotAction } from "@copilotkit/react-core";
import { CopilotChat, AssistantMessageProps, Markdown } from "@copilotkit/react-ui";
import { BookOpenIcon } from "@heroicons/react/24/outline";
import { SetupGuide } from "~/components/SetupGuide";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/ui/resizable";
import {
  History,
  Maximize2,
  Minimize2,
  X,
  MessageCirclePlus,
  Check,
  ChevronsUpDown,
  BotMessageSquare,
  Wrench,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Mail,
  Trash2,
  SendHorizonal,
  FileText,
  Terminal,
  Code2,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "~/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Separator } from "~/components/ui/separator";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupTextarea,
  InputGroupButton,
} from "~/components/ui/input-group";
import { setSelectedAgent, setCurrentThread, clearThreadHistory, resetToDefault, setThreadHistory, ensureActiveThread } from "~/redux/slices/copilotSlice";
import { useQuery, gql } from "@apollo/client";
import { useTheme } from "~/lib/theme-provider";
import { useNavigate } from "react-router-dom";

interface ComboboxAgentPickerProps {
  agents: Array<{ id: string; name: string; base_url?: string; port?: number }>;
  selectedAgentId: string;
  selectedAgentNameFallback?: string;
  onSelect: (id: string) => void;
}

function ComboboxAgentPicker({ agents, selectedAgentId, selectedAgentNameFallback, onSelect }: ComboboxAgentPickerProps) {
  const [open, setOpen] = useState(false);

  const allAgents = [
    ...agents
  ];

  const selectedAgent = allAgents.find(a => a.id === selectedAgentId);
  if (!selectedAgent && selectedAgentId) {
    console.debug('[ComboboxAgentPicker] Selected agent id not in list:', selectedAgentId, 'available:', allAgents.map(a => a.id));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[200px] justify-between"
        >
          {selectedAgent?.name || selectedAgentNameFallback || "Select agent..."}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandInput placeholder="Search agent..." className="h-9" />
          <CommandList>
            <CommandEmpty>No agent found.</CommandEmpty>
            <CommandGroup>
              {allAgents.map((agent) => (
                <CommandItem
                  key={agent.id}
                  value={agent.name}
                  keywords={[agent.id]}
                  onSelect={() => {
                    onSelect(agent.id);
                    setOpen(false);
                  }}
                >
                  {agent.name}
                  <Check
                    className={cn(
                      "ml-auto",
                      selectedAgentId === agent.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface ThreadHistoryPopoverProps {
  threadHistory: Array<{ id: string; title: string; timestamp: number }>;
  currentThreadId: string | null;
  onThreadSelect: (id: string) => void;
}

function ThreadHistoryPopover({ threadHistory, currentThreadId, onThreadSelect }: ThreadHistoryPopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          aria-label="Thread history"
          title="Thread history"
        >
          <History className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end">
        <div className="text-xs mb-2 font-semibold">Thread History</div>
        {threadHistory.length === 0 ? (
          <div className="text-xs text-muted-foreground p-2">No previous threads</div>
        ) : (
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {threadHistory.map((thread) => (
              <button
                key={thread.id}
                onClick={() => {
                  onThreadSelect(thread.id);
                  setOpen(false);
                }}
                className={cn(
                  "w-full text-left text-xs p-2 rounded-md hover:bg-muted transition-colors",
                  currentThreadId === thread.id && "bg-muted"
                )}
              >
                <div className="font-medium truncate">{thread.title}</div>
                {(thread as any).agentName && (
                  <div className="text-[10px] text-muted-foreground truncate">{(thread as any).agentName}</div>
                )}
                <div className="text-muted-foreground text-[10px]">
                  {new Date(thread.timestamp).toLocaleString()}
                </div>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface GlobalChatLayoutProps {
  children: React.ReactNode;
}

// Custom AssistantMessage component to ensure proper markdown rendering
function CustomAssistantMessage(props: AssistantMessageProps) {
  const { message, isLoading, subComponent } = props;

  return (
    <div className="">
      {(message || isLoading) && (
        <div className="px-2 rounded-lg">
          <div className="text-sm">
            {message && <Markdown content={message.content || ""} />}
            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Thinking...</span>
              </div>
            )}
          </div>
        </div>
      )}
      {subComponent && <div className="mt-2">{subComponent}</div>}
    </div>
  );
}

export function GlobalChatLayout({ children }: GlobalChatLayoutProps) {
  const dispatch = useDispatch();
  const copilotState = useSelector((state: RootState) => state.copilot);
  const {
    selectedAgentId,
    selectedAgentName,
    currentThreadId,
    threadHistory,
  } = copilotState;
  const activeThreadIds = copilotState.activeThreadIds || [];
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);

  const [chatOpen, setChatOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [currentWorkspace, setCurrentWorkspace] = useState<string | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);


  // GraphQL query for loading chat threads/sessions
  const CHAT_THREADS_QUERY = gql`
    query ChatThreads($workspaceId: String, $limit: Int) {
      chatThreads(workspaceId: $workspaceId, limit: $limit) {
        sessions {
          id
          title
          agentId
          agentName
          messageCount
          createdAt
          updatedAt
          workspaceId
        }
        total
      }
    }
  `;

  // Load sessions from backend GraphQL API
  const { data: threadsData, loading: threadsLoading, error: threadsError, refetch: refetchThreads } = useQuery(
    CHAT_THREADS_QUERY,
    {
      variables: {
        workspaceId: currentWorkspace,
        limit: 20,
      },
      skip: !currentWorkspace || !isAuthenticated,
      fetchPolicy: 'network-only',
      pollInterval: 3000,
    }
  );

  // Build a map of sessionId -> { agentId, agentName }
  const sessionsById = useMemo(() => {
    const map: Record<string, { agentId: string; agentName: string }> = {};
    const sessions = threadsData?.chatThreads?.sessions || [];
    for (const s of sessions) {
      if (s && s.id) {
        map[s.id] = { agentId: s.agentId || '', agentName: s.agentName || '' };
      }
    }
    return map;
  }, [threadsData]);

  useEffect(() => {
    if (currentThreadId && !activeThreadIds.includes(currentThreadId)) {
      dispatch(ensureActiveThread(currentThreadId));
    }
  }, [currentThreadId, activeThreadIds, dispatch]);

  // Update local state when threads are loaded
  useEffect(() => {
    if (threadsData?.chatThreads?.sessions) {
      const toMs = (v: any): number => {
        if (!v) return Date.now();
        // Handle numeric-like strings and numbers (seconds or milliseconds)
        const n = typeof v === 'string' ? Number(v) : v;
        if (typeof n === 'number' && !Number.isNaN(n)) {
          // If looks like seconds (10 digits), convert to ms
          return n < 1e12 ? n * 1000 : n;
        }
        // Attempt Date.parse for ISO strings
        const p = Date.parse(String(v));
        return Number.isNaN(p) ? Date.now() : p;
      };

      const sessions = threadsData.chatThreads.sessions.map((s: any) => ({
        id: s.id,
        title: s.title,
        timestamp: toMs(s.updatedAt || s.createdAt),
        agentId: s.agentId,
        agentName: s.agentName,
      }));

      // Update Redux store so ThreadHistoryPopover can display sessions
      dispatch(setThreadHistory(sessions));

      console.log(`📚 Loaded ${sessions.length} sessions from GraphQL for workspace ${currentWorkspace}`);
    }

    if (threadsError) {
      console.error("Failed to load chat threads:", threadsError);
    }
  }, [threadsData, threadsError, currentWorkspace]);

  // Agent query - refetch when workspace changes
  const AGENTS_QUERY = `
    query Agents {
      agents(enabled: true) {
        id
        name
        base_url
        port
      }
    }
  `;
  const { data, refetch: refetchAgents } = useQuery(gql`${AGENTS_QUERY}`, {
    fetchPolicy: 'network-only', // Always fetch fresh data
  });
  const agents = (data?.agents || []) as Array<{ id: string; name: string; base_url?: string; port?: number }>;
  useEffect(() => {
    console.debug('[GlobalChatLayout] Agents loaded:', agents.map(a => a.id));
  }, [agents]);
  // Get current workspace from localStorage on mount
  useEffect(() => {
    const workspace = typeof localStorage !== 'undefined'
      ? localStorage.getItem('currentWorkspace') || null
      : null;
    setCurrentWorkspace(workspace);
  }, []);

  // Refetch agents when workspace changes
  useEffect(() => {
    if (currentWorkspace && refetchAgents) {
      console.log('🔄 Refetching agents for workspace:', currentWorkspace);
      refetchAgents();
    }
  }, [currentWorkspace, refetchAgents]);


  function getSavedLayout(): number[] {
    if (typeof window === 'undefined') return [70, 30];

    try {
      const match = document.cookie.match(/react-resizable-panels:layout:global-chat=([^;]+)/);
      if (match) {
        const raw = match[1];
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length === 2) return parsed;
        }
      }
    } catch { }
    return [70, 30];
  }

  const [layout, setLayout] = useState<number[]>([70, 30]);

  // Load saved layout on client side
  useEffect(() => {
    const savedLayout = getSavedLayout();
    setLayout(savedLayout);
  }, []);

  const saveLayout = (sizes: number[]) => {
    if (typeof window !== 'undefined') {
      document.cookie = `react-resizable-panels:layout:global-chat=${JSON.stringify(sizes)}`;
    }
  };

  const handleAgentSelect = (id: string) => {
    const agent = agents.find(a => a.id === id);
    const agentName = agent?.name;
    dispatch(setSelectedAgent({ id, name: agentName }));
    handleNewConvo();
  };

  const handleNewConvo = () => {
    // Generate a workspace-scoped thread/session id so backend can infer workspace
    const ws = currentWorkspace || (typeof localStorage !== 'undefined' ? localStorage.getItem('currentWorkspace') : null);
    const rand = Math.random().toString(36).slice(2, 10);
    const timestamp = Date.now();
    const newId = ws ? `ws:${ws}:${timestamp}-${rand}` : `${timestamp}-${rand}`;
    dispatch(setCurrentThread(newId));
    dispatch(ensureActiveThread(newId));

    // Proactively refresh thread list so the UI updates without page reload
    try {
      if (refetchThreads && currentWorkspace && isAuthenticated) {
        // Give the backend a brief moment if it creates session on first message
        setTimeout(() => {
          refetchThreads();
        }, 750);
      }
    } catch (e) {
      console.warn('Thread refetch after new convo failed:', e);
    }
  };

  const handleThreadSelect = (threadId: string) => {
    console.debug('[GlobalChatLayout] Thread selected:', threadId);
    dispatch(setCurrentThread(threadId));
    dispatch(ensureActiveThread(threadId));
    // Auto-select agent associated with this session, if known
    const meta = sessionsById[threadId];
    if (meta && meta.agentId) {
      console.debug('[GlobalChatLayout] Selecting agent for session', threadId, meta);
      dispatch(setSelectedAgent({ id: meta.agentId, name: meta.agentName || 'Agent' }));
    } else {
      console.debug('[GlobalChatLayout] No agent metadata found for session', threadId, sessionsById);
    }
    // Refresh thread list so metadata (e.g., timestamps) stays fresh
    try {
      if (refetchThreads && currentWorkspace && isAuthenticated) {
        refetchThreads();
      }
    } catch (e) {
      console.warn('Thread refetch after selection failed:', e);
    }
  };

  const handleExpandToggle = () => setExpanded((e) => !e);

  // Auto-select "Main Agent" if no threads are active
  useEffect(() => {
    if (activeThreadIds.length === 0 && agents.length > 0) {
      const mainAgent = agents.find(a => a.name === "Main Agent");
      if (mainAgent) {
        // We need to select the agent and start a new conversation
        // We can reuse handleAgentSelect logic here but we need to be careful about dependencies
        // Since handleAgentSelect is not memoized, we'll just do the dispatch directly to avoid infinite loops if we added it to deps
        dispatch(setSelectedAgent({ id: mainAgent.id, name: mainAgent.name }));

        // We also need to trigger handleNewConvo. 
        // Since handleNewConvo depends on currentWorkspace and other things, let's just call it.
        // To avoid dependency cycles, we can wrap this in a timeout or just trust the closure.
        // But better yet, let's just define the logic we need here.

        const ws = currentWorkspace || (typeof localStorage !== 'undefined' ? localStorage.getItem('currentWorkspace') : null);
        const rand = Math.random().toString(36).slice(2, 10);
        const timestamp = Date.now();
        const newId = ws ? `ws:${ws}:${timestamp}-${rand}` : `${timestamp}-${rand}`;

        dispatch(setCurrentThread(newId));
        dispatch(ensureActiveThread(newId));

        // Proactively refresh thread list
        try {
          if (refetchThreads && currentWorkspace && isAuthenticated) {
            setTimeout(() => {
              refetchThreads();
            }, 750);
          }
        } catch (e) {
          console.warn('Thread refetch after auto-start failed:', e);
        }
      }
    }
  }, [activeThreadIds.length, agents, currentWorkspace, dispatch, isAuthenticated, refetchThreads]);

  const threadPanels = (
    <div className="flex-1 min-h-0 overflow-hidden relative">
      {activeThreadIds.length === 0 ? (
        <div className="flex h-full items-center justify-center px-4 text-sm text-muted-foreground">
          {/* Placeholder removed for auto-start */}
        </div>
      ) : (
        activeThreadIds.map((threadId) => (
          <ThreadCopilotPane
            key={threadId}
            threadId={threadId}
            isVisible={threadId === currentThreadId}
            agentMeta={sessionsById[threadId]}
            fallbackAgentId={selectedAgentId}
            fallbackAgentName={selectedAgentName}
            currentWorkspace={currentWorkspace}
          />
        ))
      )}
    </div>
  );

  // Close and reset chat when user logs out
  useEffect(() => {
    if (!isAuthenticated) {
      setChatOpen(false);
      setExpanded(false);
      dispatch(clearThreadHistory());
      dispatch(resetToDefault());
      try {
        // Clear saved layout cookie to avoid restoring open panel on next login
        if (typeof document !== 'undefined') {
          document.cookie = "react-resizable-panels:layout:global-chat=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
        }
      } catch { }
    }
  }, [isAuthenticated, dispatch]);

  // If chat is not open, just show the main content with a floating button (only if authenticated)
  if (!chatOpen) {
    return (
      <>
        {children}
        {isAuthenticated && (
          <Button
            onClick={() => setChatOpen(true)}
            size="icon"
            className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-40 hover:scale-110 transition-transform"
            aria-label="Open AI Assistant"
            title="Open AI Assistant"
          >
            <BotMessageSquare className="h-6 w-6" />
          </Button>
        )}
      </>
    );
  }

  // If expanded, show full-width chat (but respecting parent height)
  if (expanded) {
    return (
      <div className="h-full w-full overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full overflow-hidden">
          <ResizablePanel defaultSize={100} minSize={0}>
            <div className="relative h-full min-h-0 flex flex-col">
              <div
                className="flex justify-between items-center px-4"
                style={{ height: "56px" }}
              >
                <div className="flex items-center gap-2">
                  {/* <BookOpenIcon className="w-6 h-6" /> */}
                  <ComboboxAgentPicker
                    agents={agents}
                    selectedAgentId={selectedAgentId}
                    selectedAgentNameFallback={(() => {
                      const meta = sessionsById[currentThreadId || ''];
                      return meta?.agentName || '';
                    })()}
                    onSelect={handleAgentSelect}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <ThreadHistoryPopover
                    threadHistory={threadHistory}
                    currentThreadId={currentThreadId}
                    onThreadSelect={handleThreadSelect}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleNewConvo}
                    className="h-9 w-9"
                    aria-label="New conversation"
                    title="New conversation"
                  >
                    <MessageCirclePlus className="h-4 w-4" />
                  </Button>
                  <button
                    type="button"
                    onClick={handleExpandToggle}
                    className="p-2 rounded-md hover:bg-muted"
                    aria-label="Collapse panel"
                    title="Collapse"
                  >
                    <Minimize2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExpanded(false);
                      setChatOpen(false);
                    }}
                    className="p-2 rounded-md hover:bg-muted"
                    aria-label="Close chat panel"
                    title="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {threadPanels}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    );
  }

  // Normal two-panel mode
  return (
    <div className="h-full w-full overflow-hidden">
      <ResizablePanelGroup
        direction="horizontal"
        onLayout={(sizes: number[]) => {
          if (sizes.length === 2) {
            setLayout(sizes);
            saveLayout(sizes);
          }
        }}
      >
        <ResizablePanel defaultSize={layout[0]} minSize={30}>
          {children}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={layout[1]} minSize={20} maxSize={50}>
          <div className="relative h-full min-h-0 flex flex-col">
            <div
              className="flex justify-between items-center px-4"
              style={{ height: "56px" }}
            >
              <div className="flex items-center gap-2">
                {/* <BookOpenIcon className="w-6 h-6" /> */}
                <ComboboxAgentPicker
                  agents={agents}
                  selectedAgentId={selectedAgentId}
                  selectedAgentNameFallback={(() => {
                    const meta = sessionsById[currentThreadId || ''];
                    return meta?.agentName || '';
                  })()}
                  onSelect={handleAgentSelect}
                />
              </div>
              <div className="flex items-center gap-0">
                <ThreadHistoryPopover
                  threadHistory={threadHistory}
                  currentThreadId={currentThreadId}
                  onThreadSelect={handleThreadSelect}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleNewConvo}
                  className="h-9 w-9"
                  aria-label="New conversation"
                  title="New conversation"
                >
                  <MessageCirclePlus className="h-4 w-4" />
                </Button>
                <button
                  type="button"
                  onClick={handleExpandToggle}
                  className="p-2 rounded-md hover:bg-muted"
                  aria-label="Expand panel"
                  title="Expand"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setChatOpen(false)}
                  className="p-2 rounded-md hover:bg-muted"
                  aria-label="Close chat panel"
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {threadPanels}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

interface ThreadCopilotPaneProps {
  threadId: string;
  isVisible: boolean;
  agentMeta?: { agentId?: string; agentName?: string };
  fallbackAgentId: string;
  fallbackAgentName: string;
  currentWorkspace: string | null;
}

function ThreadCopilotPane({
  threadId,
  isVisible,
  agentMeta,
  fallbackAgentId,
  fallbackAgentName,
  currentWorkspace,
}: ThreadCopilotPaneProps) {
  const { token, isAuthenticated, user } = useSelector((state: RootState) => state.auth);

  const agentId = (agentMeta?.agentId || fallbackAgentId || "").trim();
  const agentName =
    agentMeta?.agentName ||
    fallbackAgentName ||
    "AI Assistant";

  const headers: Record<string, string> = {
    "X-User-Context": isAuthenticated ? "authenticated" : "unauthenticated",
    "X-Session-ID": threadId,
    "X-Thread-ID": threadId,
  };

  if (agentId) {
    headers["X-Selected-Agent-ID"] = agentId;
  }

  if (token && isAuthenticated && user?.id) {
    headers["Authorization"] = `Bearer ${token}`;
    headers["X-User-ID"] = user.id;
  }

  if (currentWorkspace) {
    headers["X-Workspace-ID"] = currentWorkspace;
  }

  const chatSuggestions = useMemo(() => {
    const base = [
      { title: "📊 Show Analytics", message: "Show me sales analytics for this month" },
      { title: "📞 List Contacts", message: "Show me all my contacts" },
      { title: "💰 View Deals", message: "Show me the current deal pipeline" },
      { title: "🏢 Organizations", message: "List all organizations" },
    ];
    if (agentName && agentName !== "Select agent...") {
      return [
        { title: `💬 Ask ${agentName}`, message: "What can you help me with?" },
        ...base.slice(0, 3),
      ];
    }
    return base;
  }, [agentName]);

  return (
    <CopilotKit
      key={`copilot-${threadId}`}
      runtimeUrl="http://localhost:4000/copilotkit"
      agent={agentId || undefined}
      threadId={threadId}
      headers={headers}
      publicLicenseKey="ck_pub_90d2ef3ab8731cd33a88be244c25f5f8"
    >
      <ThreadCopilotContent
        isVisible={isVisible}
        agentName={agentName}
        chatSuggestions={chatSuggestions}
      />
    </CopilotKit>
  );
}

interface ThreadCopilotContentProps {
  isVisible: boolean;
  agentName: string;
  chatSuggestions: Array<{ title: string; message: string }>;
}

function ThreadCopilotContent({ isVisible, agentName, chatSuggestions }: ThreadCopilotContentProps) {
  const { setTheme } = useTheme();
  const navigate = useNavigate();

  useCopilotAction({
    name: "set_theme",
    parameters: [
      {
        name: "theme",
        description: "Theme to set: 'dark', 'light', or 'system'.",
        required: true,
      },
    ],
    handler({ theme }) {
      const t = String(theme || "").toLowerCase();
      if (t === "dark" || t === "light" || t === "system") {
        setTheme(t as "dark" | "light" | "system");
      }
    },
  });

  useCopilotAction({
    name: "navigate_to",
    parameters: [
      {
        name: "path",
        description: "Route path starting with '/'.",
        required: true,
      },
    ],
    handler({ path }) {
      const p = String(path || "");
      if (p.startsWith("/")) navigate(p);
    },
  });

  useCopilotAction({
    name: "*",
    followUp: false,
    render: ({ name, args, status, result }: any) => {
      const toolsWithCustomRenderers = [
        "analyze_contact_insights",
        "send_bulk_email",
        "delete_contact",
        "prompt_user_selection",
        "set_theme",
        "navigate_to",
        "read_file_content",
        "run_command",
        "run_python_code",
      ];

      if (toolsWithCustomRenderers.includes(name)) {
        return null;
      }

      const statusText =
        status === "executing" ? "Running..." :
          status === "complete" ? "Complete" :
            "Preparing...";

      const detailBlocks: Array<{ label: string; content: string }> = [];
      const argsKeys = Object.keys(args || {});
      if (argsKeys.length > 0) {
        detailBlocks.push({ label: "Parameters", content: JSON.stringify(args, null, 2) });
      }

      if (status === "complete" && result) {
        const resultContent = typeof result === "string" ? result : JSON.stringify(result, null, 2);
        detailBlocks.push({ label: "Result", content: resultContent });
      }

      return (
        <div className="my-3 rounded-md border border-muted/70 bg-muted/30 px-4 py-3 text-xs shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs font-semibold text-foreground">{name}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{statusText}</p>
              </div>
            </div>
            {status === "executing" && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </div>

          {detailBlocks.length > 0 && (
            <div className="mt-3 space-y-3">
              {detailBlocks.map((block, index) => (
                <div
                  key={`${block.label}-${index}`}
                  className="rounded border border-muted/60 bg-background/80 p-3"
                >
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                    {block.label}
                  </p>
                  <pre className="max-h-56 overflow-auto rounded bg-muted/20 p-2 text-[11px] leading-relaxed">
                    {block.content}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    },
  });

  useCopilotAction({
    name: "read_file_content",
    render: ({ status, args }) => {
      if (status === "inProgress") {
        return null;
      }

      const filePathCandidates = [
        args?.file_path,
        args?.path,
        args?.file,
        args?.filename,
        args?.filepath,
      ];
      const filePath =
        filePathCandidates.find(
          (value) => typeof value === "string" && value.trim().length > 0
        ) || "File";

      const statusText =
        status === "executing" ? "Reading file..." : "File read";

      return (
        <div className="my-2 rounded-md border border-muted bg-background/70 px-3 py-2 text-xs">
          <div className="flex items-center gap-3">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <div className="space-y-0.5">
              <p className="uppercase tracking-wide text-[10px] text-muted-foreground">
                {statusText}
              </p>
              <p className="font-mono text-[11px] text-foreground">{filePath}</p>
            </div>
          </div>
        </div>
      );
    },
  });

  useCopilotAction({
    name: "run_command",
    render: ({ status, args, result }) => {
      if (status === "inProgress") {
        return null;
      }

      const commandCandidates = [
        args?.command,
        Array.isArray(args?.commands) ? args?.commands.join(" && ") : undefined,
        args?.cmd,
        args?.line,
      ];
      const command =
        commandCandidates.find(
          (value) => typeof value === "string" && value.trim().length > 0
        ) || "Command";

      const cwd =
        typeof args?.cwd === "string" && args.cwd.trim().length > 0
          ? args.cwd.trim()
          : null;

      const statusText =
        status === "executing" ? "Running command..." : "Command run";

      const toDisplayString = (value: any) => {
        if (value === null || value === undefined) return "";
        if (typeof value === "string") return value;
        if (Array.isArray(value)) {
          return value
            .map((entry) =>
              typeof entry === "string" ? entry : JSON.stringify(entry, null, 2)
            )
            .join("\n");
        }
        return JSON.stringify(value, null, 2);
      };

      const pushIfContent = (arr: Array<{ label: string; content: string }>, label: string, value: any) => {
        const content = toDisplayString(value).trim();
        if (content) {
          arr.push({ label, content });
        }
      };

      const detailSegments: Array<{ label: string; content: string }> = [];
      if (result && typeof result === "object" && !Array.isArray(result)) {
        const stdout = (result as any).stdout ?? (result as any).STDOUT;
        const stderr = (result as any).stderr ?? (result as any).STDERR;
        const output = (result as any).output ?? (result as any).OUTPUT;
        const exitCode =
          (result as any).exitCode ??
          (result as any).exit_code ??
          (result as any).code;

        pushIfContent(detailSegments, "stdout", stdout);
        pushIfContent(detailSegments, "stderr", stderr);
        pushIfContent(detailSegments, "output", output);

        if (typeof exitCode === "number") {
          detailSegments.push({
            label: "exit code",
            content: exitCode.toString(),
          });
        }

        const remainingKeys = Object.keys(result).filter(
          (key) =>
            !["stdout", "STDOUT", "stderr", "STDERR", "output", "OUTPUT", "exitCode", "exit_code", "code"].includes(
              key
            )
        );
        if (remainingKeys.length > 0) {
          const remainingObj: Record<string, unknown> = {};
          for (const key of remainingKeys) {
            (remainingObj as any)[key] = (result as any)[key];
          }
          pushIfContent(detailSegments, "result", remainingObj);
        }
      } else if (result) {
        pushIfContent(detailSegments, "result", result);
      }

      const hasDetails = detailSegments.length > 0;

      return (
        <div className="my-2 rounded-md border border-muted bg-background/70 px-3 py-2 text-xs">
          <div className="flex items-center gap-3">
            <Terminal className="h-4 w-4 text-muted-foreground" />
            <div className="space-y-0.5">
              <p className="uppercase tracking-wide text-[10px] text-muted-foreground">
                {statusText}
              </p>
              <p className="font-mono text-[11px] text-foreground break-all">{command}</p>
              {cwd && (
                <p className="text-[10px] text-muted-foreground">cwd: {cwd}</p>
              )}
            </div>
          </div>

          {hasDetails && (
            <details className="mt-3 space-y-2 rounded border border-muted/70 bg-muted/20 px-3 py-2">
              <summary className="cursor-pointer text-[11px] font-medium">Show output</summary>
              <div className="space-y-2 pt-2">
                {detailSegments.map((segment, index) => (
                  <div key={`${segment.label}-${index}`}>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                      {segment.label}
                    </p>
                    <pre className="max-h-56 overflow-auto rounded border border-muted bg-background p-2 text-[11px] leading-relaxed">
                      {segment.content}
                    </pre>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      );
    },
  });

  useCopilotAction({
    name: "run_python_code",
    render: ({ status, args, result }) => {
      if (status === "inProgress") {
        return null;
      }

      const codeCandidates = [
        args?.code,
        args?.script,
        args?.source,
        args?.python,
      ];
      const rawCode =
        codeCandidates.find(
          (value) => typeof value === "string" && value.trim().length > 0
        ) || "";

      const codePreview = rawCode
        ? rawCode.trim().split("\n").slice(0, 2).join(" ").slice(0, 80)
        : "Python code";

      const statusText =
        status === "executing" ? "Executing Python..." : "Python executed";

      const toDisplayString = (value: any) => {
        if (value === null || value === undefined) return "";
        if (typeof value === "string") return value;
        if (Array.isArray(value)) {
          return value
            .map((entry) =>
              typeof entry === "string" ? entry : JSON.stringify(entry, null, 2)
            )
            .join("\n");
        }
        return JSON.stringify(value, null, 2);
      };

      const detailSegments: Array<{ label: string; content: string }> = [];
      const pushIfContent = (label: string, value: any) => {
        const content = toDisplayString(value).trim();
        if (content) {
          detailSegments.push({ label, content });
        }
      };

      if (result && typeof result === "object" && !Array.isArray(result)) {
        const stdout = (result as any).stdout ?? (result as any).STDOUT;
        const stderr = (result as any).stderr ?? (result as any).STDERR;
        const returnValue =
          (result as any).result ??
          (result as any).returnValue ??
          (result as any).value;

        pushIfContent("stdout", stdout);
        pushIfContent("stderr", stderr);
        pushIfContent("result", returnValue);

        const remainingKeys = Object.keys(result).filter(
          (key) =>
            !["stdout", "STDOUT", "stderr", "STDERR", "result", "returnValue", "value"].includes(
              key
            )
        );
        if (remainingKeys.length > 0) {
          const remainingObj: Record<string, unknown> = {};
          for (const key of remainingKeys) {
            (remainingObj as any)[key] = (result as any)[key];
          }
          pushIfContent("details", remainingObj);
        }
      } else if (result) {
        pushIfContent("result", result);
      }

      const showDetails = rawCode.length > 0 || detailSegments.length > 0;

      return (
        <div className="my-2 rounded-md border border-muted bg-background/70 px-3 py-2 text-xs">
          <div className="flex items-center gap-3">
            <Code2 className="h-4 w-4 text-muted-foreground" />
            <div className="space-y-0.5">
              <p className="uppercase tracking-wide text-[10px] text-muted-foreground">
                {statusText}
              </p>
              <p className="font-mono text-[11px] text-foreground break-all">
                {codePreview}
                {rawCode.length > 80 && "..."}
              </p>
            </div>
          </div>

          {showDetails && (
            <details className="mt-3 space-y-3 rounded border border-muted/70 bg-muted/20 px-3 py-2">
              <summary className="cursor-pointer text-[11px] font-medium">Show details</summary>
              <div className="space-y-3 pt-2">
                {rawCode && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                      Code
                    </p>
                    <pre className="max-h-56 overflow-auto rounded border border-muted bg-background p-2 text-[11px] leading-relaxed">
                      {rawCode}
                    </pre>
                  </div>
                )}

                {detailSegments.map((segment, index) => (
                  <div key={`${segment.label}-${index}`}>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                      {segment.label}
                    </p>
                    <pre className="max-h-56 overflow-auto rounded border border-muted bg-background p-2 text-[11px] leading-relaxed">
                      {segment.content}
                    </pre>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      );
    },
  });

  useCopilotAction({
    name: "analyze_contact_insights",
    description: "Analyze contact insights and engagement patterns",
    parameters: [
      {
        name: "contact_id",
        type: "string",
        description: "ID of the contact to analyze",
        required: true,
      },
      {
        name: "analysis_type",
        type: "string",
        description: "Type of analysis (engagement, revenue, activity, sentiment)",
        required: true,
      },
    ],
    render: ({ status, args }) => {
      if (status === "inProgress") {
        return null;
      }

      return (
        <Card className="my-2 border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <BotMessageSquare className="h-4 w-4 text-primary" />
              Analyzing Contact Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex items-baseline gap-2">
                <span className="font-medium">Contact ID:</span>
                <Badge variant="outline">{args.contact_id}</Badge>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-medium">Analysis Type:</span>
                <span className="text-muted-foreground">{args.analysis_type}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    },
  });

  useCopilotAction({
    name: "send_bulk_email",
    parameters: [
      {
        name: "recipients",
        type: "string",
        description: "Comma-separated list of recipient emails or contact IDs",
        required: true,
      },
      {
        name: "subject",
        type: "string",
        description: "Email subject line",
        required: true,
      },
      {
        name: "message",
        type: "string",
        description: "Email message body",
        required: true,
      },
    ],
    renderAndWaitForResponse: ({ status, args, respond, result }) => {
      if (status === "inProgress") {
        return null;
      }

      if (status === "executing") {
        return (
          <Card className="my-2 border-primary/30 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" />
                Bulk Email Review
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Recipients</p>
                <div className="text-sm bg-muted rounded-md p-2 max-h-32 overflow-auto">
                  {(args.recipients || "")
                    .split(",")
                    .map((recipient: string) => recipient.trim())
                    .filter(Boolean)
                    .map((recipient: string, index: number) => (
                      <div key={index}>{recipient}</div>
                    ))}
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Subject</p>
                <p className="text-sm bg-muted rounded-md p-2">{args.subject}</p>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Message</p>
                <p className="text-sm bg-muted rounded-md p-3">{args.message}</p>
              </div>
            </CardContent>

            <CardFooter className="flex gap-2 pt-4">
              <Button
                size="sm"
                className="flex-1"
                onClick={() => respond({ approved: true })}
              >
                Send Email
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => respond({ approved: false })}
              >
                Cancel
              </Button>
            </CardFooter>
          </Card>
        );
      }

      const wasApproved = result?.approved === true;
      return (
        <Alert className={cn(
          "my-2",
          wasApproved ? "border-muted" : "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950"
        )}>
          {wasApproved ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <X className="h-4 w-4 text-blue-600" />
          )}
          <AlertDescription className={!wasApproved ? "text-blue-700 dark:text-blue-300" : ""}>
            {wasApproved ? "Email sent successfully" : "Email sending cancelled"}
          </AlertDescription>
        </Alert>
      );
    },
  });

  useCopilotAction({
    name: "delete_contact",
    parameters: [
      {
        name: "contact_id",
        type: "string",
        description: "ID of the contact to delete",
        required: true,
      },
      {
        name: "reason",
        type: "string",
        description: "Reason for deletion",
        required: true,
      },
    ],
    render: ({ status, args, respond, result }) => {
      if (status === "inProgress") {
        return null;
      }

      if (status === "executing") {
        return (
          <Card className="my-2 border-destructive/50 bg-destructive/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                <Trash2 className="h-4 w-4" />
                Delete Contact?
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="space-y-2 text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium">Contact ID:</span>
                  <Badge variant="outline">{args.contact_id}</Badge>
                </div>
                <div>
                  <span className="font-medium">Reason:</span>
                  <p className="text-muted-foreground mt-1">{args.reason}</p>
                </div>
              </div>

              <Alert variant="destructive" className="text-xs">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Warning: This action cannot be undone. The contact and all associated data will be permanently deleted.
                </AlertDescription>
              </Alert>
            </CardContent>

            <CardFooter className="flex gap-2 pt-4">
              <Button
                size="sm"
                variant="destructive"
                onClick={() => respond({ confirmed: true, deleted_at: Date.now() })}
                className="flex-1"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete Contact
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => respond({ confirmed: false })}
                className="flex-1"
              >
                Cancel
              </Button>
            </CardFooter>
          </Card>
        );
      }

      const wasConfirmed = result?.confirmed === true;

      return (
        <Alert className={cn(
          "my-2",
          wasConfirmed ? "border-muted" : "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950"
        )}>
          {wasConfirmed ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <X className="h-4 w-4 text-blue-600" />
          )}
          <AlertDescription className={!wasConfirmed ? "text-blue-700 dark:text-blue-300" : ""}>
            {wasConfirmed ? "Contact deleted" : "Deletion cancelled"}
          </AlertDescription>
        </Alert>
      );
    },
  });

  useCopilotAction({
    name: "prompt_user_selection",
    description: "Prompt the user to select from a list of choices",
    parameters: [
      {
        name: "question",
        type: "string",
        description: "The question to ask the user",
        required: true,
      },
      {
        name: "choices",
        type: "string",
        description: "Newline-separated list of choices for the user to select from (one choice per line)",
        required: true,
      },
    ],
    renderAndWaitForResponse: ({ status, args, respond, result }) => {
      if (status === "inProgress") {
        return null;
      }

      if (status === "executing") {
        const rawChoices = (args.choices ?? "").toString();

        const cleanChoice = (choice: string) => {
          let cleaned = choice.trim();
          if (cleaned.startsWith("[")) {
            cleaned = cleaned.slice(1).trim();
          }
          if (cleaned.endsWith("]")) {
            cleaned = cleaned.slice(0, -1).trim();
          }
          if (
            (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
            (cleaned.startsWith("'") && cleaned.endsWith("'"))
          ) {
            cleaned = cleaned.slice(1, -1).trim();
          }
          return cleaned;
        };

        const parseChoices = (input: string) => {
          const trimmed = input.trim();
          if (!trimmed) return [];

          try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
              return parsed.map((c) => cleanChoice(String(c)));
            }
          } catch (_) {
            // Not valid JSON; fall through to delimiter parsing.
          }

          const newlineSplit = trimmed
            .split(/\r?\n/)
            .map((c) => cleanChoice(c))
            .filter(Boolean);
          if (trimmed.includes("\n") || newlineSplit.length > 1) {
            return newlineSplit;
          }

          if (trimmed.includes("|")) {
            return trimmed
              .split("|")
              .map((c) => cleanChoice(c))
              .filter(Boolean);
          }

          if (trimmed.includes(",")) {
            return trimmed
              .split(",")
              .map((c) => cleanChoice(c))
              .filter(Boolean);
          }

          return [cleanChoice(trimmed)];
        };

        const choices = parseChoices(rawChoices);

        const handleChoiceClick = (choice: string) => {
          respond({
            selected: choice,
            question: args.question,
            timestamp: Date.now(),
          });
        };

        return (
          <Card className="my-2 border-primary/30 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <BotMessageSquare className="h-4 w-4 text-primary" />
                {args.question || "Please select an option"}
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-2">
              {choices.map((choice, index) => (
                <Button
                  key={index}
                  onClick={() => handleChoiceClick(choice)}
                  variant="outline"
                  className="w-full justify-start text-left h-auto py-3 px-4 hover:bg-primary hover:text-primary-foreground transition-all whitespace-normal break-words"
                >
                  {choice}
                </Button>
              ))}
            </CardContent>
          </Card>
        );
      }

      const selected = result?.selected;

      return (
        <Alert className="my-2 border-primary/30 bg-primary/5">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <AlertDescription>
            Selected: <strong>{selected}</strong>
          </AlertDescription>
        </Alert>
      );
    },
  });

  useCopilotAction({
    name: "prompt_user_input",
    description: "Prompt the user to fill in one or more input fields",
    parameters: [
      {
        name: "question",
        type: "string",
        description: "The question or prompt to show above the form",
        required: true,
      },
      {
        name: "fields",
        type: "string",
        description: "Pipe-separated list of field definitions in format 'name:label:placeholder:type'",
        required: true,
      },
      {
        name: "submit_label",
        type: "string",
        description: "Label for the submit button",
        required: false,
      },
    ],
    renderAndWaitForResponse: ({ status, args, respond, result }) => {
      const [formValues, setFormValues] = useState<Record<string, string>>({});

      if (status === "inProgress") {
        return null;
      }

      if (status === "executing") {
        const fieldDefinitions = (args.fields || "")
          .split("|")
          .map((f) => f.trim())
          .filter(Boolean)
          .map((fieldDef) => {
            const parts = fieldDef.split(":");
            return {
              name: parts[0] || "",
              label: parts[1] || "",
              placeholder: parts[2] || "",
              type: parts[3] || "text",
            };
          });

        const submitLabel = args.submit_label || "Submit";

        const handleInputChange = (fieldName: string, value: string) => {
          setFormValues((prev) => ({
            ...prev,
            [fieldName]: value,
          }));
        };

        const handleSubmit = (e: React.FormEvent) => {
          e.preventDefault();
          respond({
            ...formValues,
            timestamp: Date.now(),
          });
        };

        return (
          <Card className="my-2 border-primary/30 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <BotMessageSquare className="h-4 w-4 text-primary" />
                {args.question || "Please provide the following information"}
              </CardTitle>
            </CardHeader>

            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-3">
                {fieldDefinitions.map((field, index) => (
                  <div key={index} className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      {field.label}
                    </label>
                    <InputGroup>
                      {field.type === "textarea" ? (
                        <InputGroupTextarea
                          placeholder={field.placeholder}
                          value={formValues[field.name] || ""}
                          onChange={(e) => handleInputChange(field.name, e.target.value)}
                          required
                        />
                      ) : (
                        <InputGroupInput
                          type={field.type}
                          placeholder={field.placeholder}
                          value={formValues[field.name] || ""}
                          onChange={(e) => handleInputChange(field.name, e.target.value)}
                          required
                        />
                      )}
                    </InputGroup>
                  </div>
                ))}
              </CardContent>

              <CardFooter className="pt-4">
                <Button
                  type="submit"
                  className="w-full"
                  disabled={fieldDefinitions.some((f) => !formValues[f.name])}
                >
                  {submitLabel}
                  <SendHorizonal className="h-4 w-4 ml-2" />
                </Button>
              </CardFooter>
            </form>
          </Card>
        );
      }

      const isObjectResult = result && typeof result === "object" && !Array.isArray(result);
      const submittedFields = isObjectResult ? Object.keys(result).filter((k) => k !== "timestamp") : [];

      if (!isObjectResult || submittedFields.length === 0) {
        const message =
          typeof result === "string" && result.trim().length > 0
            ? result
            : "Form was closed before any information was provided.";
        return (
          <Alert className="my-2 border-muted">
            <X className="h-4 w-4 text-muted-foreground" />
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        );
      }

      return (
        <Alert className="my-2 border-primary/30 bg-primary/5">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <AlertDescription>
            <div className="space-y-1">
              <p className="font-medium">Form submitted successfully!</p>
              {submittedFields.map((key) => (
                <p key={key} className="text-xs">
                  <strong>{key}:</strong> {result[key]}
                </p>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      );
    },
  });

  return (
    <div className={cn("absolute inset-0 flex flex-col", !isVisible && "hidden")}>
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        <div className="p-3">
          <SetupGuide />
        </div>
        <div className="flex-1 min-h-0">
          <CopilotChat
            className="h-full"
            labels={{
              title: agentName,
              initial: "",
            }}
            suggestions={chatSuggestions}
            AssistantMessage={CustomAssistantMessage}
          />
        </div>
      </div>
    </div>
  );
}
