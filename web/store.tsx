import { useStore } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import Dexie from "dexie";
import { createContext, useContext, useMemo, useState } from "react";
import { type DexieSchema } from "../db";
import { HNSWVectorStore } from "../memory/vector";
import { MemoryStore } from "../memory";
import { Embedder } from "../memory/embedder";
import { AccountUtils, Ed25519Account } from "@aptos-labs/ts-sdk";
import { askWithGemini } from "../ai/gemini.client";
import { outdent } from "outdent";
import type { GeminiEvent } from "../ai/gemini";
import PQueue from "p-queue";

const AI_PROMPT = outdent`
  <system-prompt> You are HealthDB, a comprehensive health data assistant designed to help users collect, organize, and analyze their health information.
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
  {{CURRENT_CONVERSATION}}
  </current-conversation> 
  
  Respond to the user message with the guidelines above and use the current-conversation as context.
`;

const USER_PROMPT = outdent`
  You are a user interacting with HealthDB, a health data assistant. Your goal is to provide relevant follow-up information while maintaining a natural conversation.

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
  {{CURRENT_CONVERSATION}}
  </current-conversation>

  ### CONVERSATION CONTINUATION:

  Based on the <current-message> Respond as a user in a way that **extends the conversation naturally**, providing **useful follow-ups, additional context, or new concerns**.
`;

export async function* generateAiResponse(
  history: { role: "model" | "user"; text: string }[],
  message: string
) {
  const collated = history
    .map((h) => `${h.role[0].toUpperCase() + h.role.slice(1)}: ${h.text}`)
    .join("\n");

  const prompt = AI_PROMPT.replace("{{CURRENT_CONVERSATION}}", collated);

  yield* askWithGemini({
    systemInstruction: {
      role: "model",
      parts: [{ text: prompt }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: `<current-message>${message}</current-message>` }],
      },
    ],
  });
}

export async function* generateUserResponse(
  history: { role: "model" | "user"; text: string }[],
  message: string
) {
  const collated = history
    .map((h) => `${h.role[0].toUpperCase() + h.role.slice(1)}: ${h.text}`)
    .join("\n");

  const prompt = USER_PROMPT.replace("{{CURRENT_CONVERSATION}}", collated);

  yield* askWithGemini({
    systemInstruction: {
      role: "model",
      parts: [{ text: prompt }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: `<current-message>${message}</current-message>` }],
      },
    ],
  });
}

interface ResearchNode {
  id: string;
  depth: number;

  history: { role: "model" | "user"; text: string }[];
  children: ResearchNode[];

  status: "generating" | "completed";
  events: GeminiEvent[];
  buffer: string;
}

interface State {
  account: Ed25519Account;
  messages: { completed: boolean; value: string }[];

  status: "researching" | "idle";
  history: { role: "model" | "user"; text: string }[];
  nodes: Map<string, ResearchNode>;
}

async function visitResearchNode(
  state: Store<State>,
  queue: PQueue,
  current: ResearchNode,
  prompt: string
) {
  const currentRole =
    current.depth % 2 === 0 ? ("model" as const) : ("user" as const);

  const generateResponse =
    currentRole === "model" ? generateAiResponse : generateUserResponse;

  state.setState((state) => ({
    ...state,
    nodes: new Map(state.nodes).set(current.id, current),
  }));

  for await (const event of generateResponse(current.history, prompt)) {
    current.events.push(event);
    const text = event.candidates[0]?.content.parts[0].text;
    if (text !== undefined) {
      current.buffer += text;
    }

    state.setState((state) => ({
      ...state,
      nodes: new Map(state.nodes).set(current.id, current),
    }));
  }

  current.status = "completed";

  if (current.depth >= 2) {
    return;
  }

  for (let i = 0; i < 3; i++) {
    const child: ResearchNode = {
      id: crypto.randomUUID(),
      depth: current.depth + 1,
      history: [
        ...structuredClone(current.history),
        { role: currentRole, text: prompt },
      ],
      children: [],
      status: "generating",
      events: [],
      buffer: "",
    };

    queue.add(async () => {
      await visitResearchNode(state, queue, child, current.buffer);
    });
  }
}

export class GlobalStore {
  state: Store<State>;
  db: Dexie & DexieSchema;
  embedder: Embedder;
  vector: HNSWVectorStore;
  memory: MemoryStore;

  async research(prompt: string) {
    if (this.state.state.status === "researching") {
      return;
    }

    const queue = new PQueue();
    this.state.setState((state) => ({ ...state, status: "researching" }));

    try {
      for (let i = 0; i < 3; i++) {
        const init: ResearchNode = {
          id: crypto.randomUUID(),
          depth: 0,
          history: structuredClone(this.state.state.history),
          children: [],
          status: "generating",
          events: [],
          buffer: "",
        };

        queue.add(async () => {
          await visitResearchNode(this.state, queue, init, prompt);
        });
      }
    } finally {
      await queue.onIdle();

      this.state.setState((state) => ({ ...state, status: "idle" }));
    }
  }

  constructor() {
    // NOTE(kenta): lol yes this is unsafe but the sign message
    // api's in aptos wallet adapter really needs improvement

    let account: Ed25519Account;

    const encoded = window.localStorage.getItem("healthdb_keys");
    if (encoded === null) {
      account = Ed25519Account.generate();
      window.localStorage.setItem(
        "healthdb_keys",
        AccountUtils.toHexString(account)
      );
    } else {
      account = AccountUtils.ed25519AccountFromHex(encoded);
    }

    this.state = new Store<State>({
      account,
      messages: [],
      status: "idle",
      nodes: new Map(),
      history: [],
    });

    this.db = new Dexie("my-db") as Dexie & DexieSchema;
    this.db.version(1).stores({
      hnswNodes: "++id",
      measurements: "++id",
      conversations: "++id",
      memories: "++id",
      events: "++id",
    });
    void this.db.open();

    this.embedder = new Embedder();
    this.vector = new HNSWVectorStore(this.db, 384);
    this.memory = new MemoryStore({
      vector: this.vector,
      db: this.db,
      embedder: this.embedder,
    });
  }

  async askAndSaveToMemory(question: string) {
    void this.memory.add(question);

    return askWithGemini({
      contents: [
        {
          role: "user",
          parts: [{ text: question }],
        },
      ],
    });
  }

  // async runMCTS(question: string) {
  //   const rootNode = new MCTSNode([question]);

  //   const bestResponse = await mctsSearch(rootNode, 500);
  //   console.log(`AI: ${bestResponse}`);

  //   const userPrompt = askWithGemini(
  //     generateUserResponse([...rootNode.conversationState], bestResponse).body
  //   );

  //   const userResponse = await readAll(userPrompt);
  //   console.log(`User: ${userResponse}`);

  //   return bestResponse;
  // }
}

const GlobalStoreContext = createContext<GlobalStore | null>(null);

export const GlobalStoreProvider = ({ children }: React.PropsWithChildren) => {
  const [store] = useState(new GlobalStore());

  const value = useMemo(() => {
    return store;
  }, [store]);

  return (
    <GlobalStoreContext.Provider value={value}>
      {children}
    </GlobalStoreContext.Provider>
  );
};

export function useGlobalStore<TSelected = GlobalStore["state"]>(
  selector?: (state: GlobalStore["state"]["state"]) => TSelected
): TSelected {
  const store = useContext(GlobalStoreContext);
  if (store === null) {
    throw new Error("useGlobalStore must be used within a GlobalStoreProvider");
  }

  return useStore(store.state, selector);
}

export function useGlobals() {
  const store = useContext(GlobalStoreContext);

  if (store === null) {
    throw new Error("useGlobals must be used within a GlobalStoreProvider");
  }

  return store;
}

export function useVectorStore() {
  const store = useContext(GlobalStoreContext);
  if (store === null) {
    throw new Error("useVectorStore must be used within a GlobalStoreProvider");
  }
  return store.vector;
}

export function useMemoryStore() {
  const store = useContext(GlobalStoreContext);
  if (store === null) {
    throw new Error("useMemoryStore must be used within a GlobalStoreProvider");
  }
  return store.memory;
}

export function useEmbedder() {
  const store = useContext(GlobalStoreContext);
  if (store === null) {
    throw new Error("useEmbedder must be used within a GlobalStoreProvider");
  }
  return store.embedder;
}

export function useDexie() {
  const store = useContext(GlobalStoreContext);
  if (store === null) {
    throw new Error("useDexie must be used within a GlobalStoreProvider");
  }
  return store.db;
}
