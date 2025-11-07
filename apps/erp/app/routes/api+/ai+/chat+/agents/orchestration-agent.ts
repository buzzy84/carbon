import { openai } from "@ai-sdk/openai";
import { purchasingAgent } from "./purchasing-agent";
import { searchAgent } from "./search-agent";
import { createAgent } from "./shared/agent";
import { formatContextForLLM } from "./shared/prompts";

export const orchestrationAgent = createAgent({
  name: "triage",
  model: openai("gpt-4o"),
  temperature: 0.1,
  modelSettings: {
    toolChoice: {
      type: "tool",
      toolName: "handoff_to_agent",
    },
  },
  instructions: (ctx) => `Route user requests to the appropriate specialist.

<background-data>
${formatContextForLLM(ctx)}

<agent-capabilities>
general: General questions, greetings, web search
parts: Search for parts by description or readable ID
suppliers: Search for suppliers, find suppliers for parts
purchasing: creating purchase orders or getting quotes from suppliers
</agent-capabilities>
</background-data>`,
  handoffs: [purchasingAgent, searchAgent],
  maxTurns: 1,
});
