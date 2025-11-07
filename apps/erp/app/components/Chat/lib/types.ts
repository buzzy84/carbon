import type {
  AgentDataParts,
  AgentUIMessage as BaseAgentUIMessage,
} from "@ai-sdk-tools/agents";
import type { UIMessage } from "ai";

export type UITools = Record<string, any>;

export type ChatMessageMetadata = {
  webSearch?: boolean;
  toolCall?: {
    toolName: string;
    toolParams: Record<string, any>;
  };
};

export type MessageDataParts = Record<string, any> & {
  toolChoice?: string;
  agentChoice?: string;
};

// Define the UI chat message type with proper metadata and tool typing
export type UIChatMessage = UIMessage<
  ChatMessageMetadata,
  MessageDataParts,
  UITools
>;

/**
 * Extended agent status type with application-specific agent names
 */
export type AgentStatus = {
  status: "routing" | "executing" | "completing";
  agent: "triage" | "purchasing" | "parts" | "suppliers" | "general";
};
/**
 * Extended data parts interface with application-specific data
 *
 * This demonstrates how to extend the base AgentDataParts with
 * custom data parts for your application.
 */
export interface AppDataParts extends AgentDataParts {
  // Override the agent-status with our extended type
  "agent-status": AgentStatus;
}

export type AgentUIMessage = BaseAgentUIMessage<never, AppDataParts>;
