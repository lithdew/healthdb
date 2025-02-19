import { outdent } from "outdent";
import { askWithGemini } from "../ai/gemini.client";
import { zodToVertexSchema } from "@techery/zod-to-vertex-schema";
import { z } from "zod";
import { getSummarizeConversationPrompt } from "../ai/functions";
import { readAllAndValidate } from "../ai/gemini.client";

export class MCTSNode {
  parent: MCTSNode | null;
  children: MCTSNode[];
  visits: number;
  wins: number;
  conversationState: string[]; // Stores conversation messages
  summarizedConversation: null | string;
  explorationConstant: number = Math.sqrt(2);

  constructor(conversationState: string[], parent: MCTSNode | null = null) {
    this.parent = parent;
    this.summarizedConversation = null;
    this.children = [];
    this.visits = 0;
    this.wins = 0;
    this.conversationState = conversationState;
  }

  ucb1(): number {
    if (this.visits === 0) return Infinity;
    const exploitation = this.wins / this.visits;
    const exploration =
      this.explorationConstant *
      Math.sqrt(Math.log(this.parent!.visits) / this.visits);
    return exploitation + exploration;
  }

  selectChild(): MCTSNode {
    return this.children.reduce((best, child) =>
      child.ucb1() > best.ucb1() ? child : best
    );
  }

  expand(candidateResponses: string[]): MCTSNode[] {
    this.children = candidateResponses.map(
      (response) => new MCTSNode([...this.conversationState, response], this)
    );
    return this.children;
  }

  async simulate() {
    const scoreResponsePrompt = scoreResponse(this.conversationState);
    const result = askWithGemini(scoreResponsePrompt.body);
    const score = await readAllAndValidate(result, scoreResponsePrompt.schema);
    return score;
  }

  backpropagate(score: number): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let node: MCTSNode | null = this;
    while (node) {
      node.visits++;
      node.wins += score;
      node = node.parent;
    }
  }
}

export function generateAIResponse(
  conversationHistory: string[],
  currentMessage: string
) {
  return {
    body: {
      systemInstruction: {
        role: "model" as const,
        parts: [
          {
            text: `<system-prompt> You are HealthDB, a comprehensive health data assistant designed to help users collect, organize, and analyze their health information.
    Your primary goal is to act as an interactive health journal and guide that compiles the user’s medical history, fitness goals, wearable device readings, and other health data into a structured database.
    Whenever needed, you ask specific follow-up questions to ensure that you have all the necessary information to provide useful, accurate guidance.
            
    Please do NOT simply send the user off to a qualified healthcare professional.

    Your goal is to help the user self-diagnose by:
    1. asking only a few, smartly-chosen follow-up questions which the user could likely easily answer to better understand the user's health or come up with a preliminary diagnosis,
    2. explaining why you asked these follow-up questions,
    3. understanding the user's intentions and symptoms and medical history and background, and
    4. providing them with as much comprehensive and explicit insight and information as possible so that they may learn and have better insight into their own health.

    Healthcare professionals are busy people that do not always have the time or care to be able to ask follow-up questions and gather as much information as possible from the user,
    leading to misdiagnosis or prescription errors which could sometimes lead to death. It is your job to prevent this from happening. </system-prompt>

    <current-conversation>
    ${conversationHistory.join("\n")}
    </current-conversation> 
    
    Respond to the user message with the guidelines above and use the current-conversation as context.
    `,
          },
        ],
      },
      contents: [
        {
          role: "user" as const,
          parts: [
            {
              text: `<current-message>${currentMessage}</current-message>`,
            },
          ],
        },
      ],
    },
  };
}

export function generateUserResponse(
  conversationHistory: string[],
  currentMessage: string
) {
  return {
    body: {
      systemInstruction: {
        role: "model" as const,
        parts: [
          {
            text: outdent`You are a user interacting with HealthDB, a health data assistant. Your goal is to provide relevant follow-up information while maintaining a natural conversation.

### CONTEXT:
The assistant has just responded to your initial inquiry about your blood pressure readings, weight, and fitness habits. It may have:
- Provided an assessment of your readings.
- Asked for additional health-related details (e.g., symptoms, sleep patterns, stress levels, diet, or family history).
- Suggested possible explanations and asked clarifying questions.

### OBJECTIVE:
- Continue the conversation **naturally and realistically** based on the assistant’s response.
- If the assistant **asked a follow-up question**, answer it **accurately and concisely**.
- If the assistant **suggested a concern**, **express your thoughts** on it (e.g., "That makes sense," or "That’s concerning—should I see a doctor?").
- If the assistant **requested more data**, provide it in a way that aligns with the original inquiry.
- If you have **new concerns or context**, bring them up **organically** (e.g., “By the way, I also sometimes feel lightheaded after running.”).

### RESPONSE EXAMPLE (FORMAT FLEXIBLE):
- **If the assistant asked about symptoms**:  
  _"I haven’t noticed any dizziness or headaches, but sometimes I feel a bit lightheaded after my runs. Should I be worried?"_
  
- **If the assistant asked about sleep habits**:  
  _"I usually sleep around 6-7 hours a night, but I sometimes wake up feeling tired. Could this be related?"_

- **If the assistant provided reassurance**:  
  _"That’s good to hear. Is there anything I should do to further optimize my heart health?"_

- **If the assistant suggested monitoring patterns**:  
  _"I can track my blood pressure over the next few weeks. What patterns should I look out for?"_


    <current-conversation>
    ${conversationHistory.join("\n")}
    </current-conversation>

### CONVERSATION CONTINUATION:

Based on the <current-message> Respond as a user in a way that **extends the conversation naturally**, providing **useful follow-ups, additional context, or new concerns**.
    `,
          },
        ],
      },
      contents: [
        {
          role: "user" as const,
          parts: [
            {
              text: `<current-message>${currentMessage}</current-message>`,
            },
          ],
        },
      ],
    },
  };
}

export function scoreResponse(conversationHistory: string[]) {
  const responseSchema = z.object({
    score: z.number(),
  });
  return {
    body: {
      systemInstruction: {
        role: "model" as const,
        parts: [
          {
            text: outdent`
You are a conversation quality evaluator. Your task is to score each conversation response on a scale of 0 to 100 based on the following criteria:
1. **Helpfulness**: 
   - Does the response provide clear, actionable, and relevant guidance?
   - Does it address the user's query or concern effectively?

2. **Insightfulness**:
   - Does the response offer deep analysis or thoughtful observations?
   - Does it demonstrate an understanding of the user's context and underlying issues?

3. **Validity of Data**:
   - Are any facts, figures, or health data mentioned accurate and supported by logical reasoning?
   - Does the response rely on valid data or best practices for health insights?

**Instructions:**
- Analyze the conversation response carefully.
- Assign a score from 0 to 100, where 0 indicates a very poor response and 100 represents an ideal response.
- Consider the balance between being concise and being comprehensive.
- If any area (helpfulness, insightfulness, or data validity) is lacking, the overall score should reflect that deficiency.

Now, given the following conversation response, please generate a score between 0 and 100:
    `,
          },
        ],
      },
      contents: [
        {
          role: "user" as const,
          parts: [
            {
              text: `<current-conversation>${conversationHistory.join(
                "\n"
              )}</current-conversation>`,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json" as const,
        responseSchema: zodToVertexSchema(responseSchema),
      },
    },
    schema: responseSchema,
  };
}

export async function mctsSearch(root: MCTSNode, iterations: number = 10) {
  for (let i = 0; i < iterations; i++) {
    let node = root;

    // Selection
    while (node.children.length > 0) {
      node = node.selectChild();
    }

    // Expansion
    if (node.conversationState.length < 5) {
      const conversations: string[] = [];

      if (node.conversationState.length > 2) {
        const summarizedConversation = askWithGemini(
          getSummarizeConversationPrompt(node.conversationState).body
        );

        let summary = "";
        for await (const chunk of summarizedConversation) {
          const text = chunk.candidates[0]?.content.parts[0]?.text ?? "";
          summary += text;
        }
        conversations.push(summary);
      }

      const lastMessage =
        node.conversationState[node.conversationState.length - 1];

      if (lastMessage !== undefined) {
        conversations.push(lastMessage);
      }

      const aiResponsePrompt = generateAIResponse(conversations, lastMessage);

      const candidateResponses = await Promise.all([
        askWithGemini(aiResponsePrompt.body),
        askWithGemini(aiResponsePrompt.body),
        askWithGemini(aiResponsePrompt.body),
      ]);

      let r1Content = "";
      let r2Content = "";
      let r3Content = "";

      await Promise.all([
        (async () => {
          for await (const chunk of candidateResponses[0]) {
            const text = chunk.candidates[0]?.content.parts[0]?.text ?? "";
            r1Content += text;
          }
        })(),
        (async () => {
          for await (const chunk of candidateResponses[1]) {
            const text = chunk.candidates[0]?.content.parts[0]?.text ?? "";
            r2Content += text;
          }
        })(),
        (async () => {
          for await (const chunk of candidateResponses[2]) {
            const text = chunk.candidates[0]?.content.parts[0]?.text ?? "";
            r3Content += text;
          }
        })(),
      ]);
      // handle streaming here
      node.expand([r1Content, r2Content, r3Content]);
    }

    // Simulation
    const { score } = await node.simulate();

    // Backpropagation
    node.backpropagate(score);
  }

  return root.selectChild().conversationState[1];
}
