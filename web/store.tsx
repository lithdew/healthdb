import { AccountUtils, Ed25519Account } from "@aptos-labs/ts-sdk";
import { useStore } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { zodToVertexSchema } from "@techery/zod-to-vertex-schema";
import Dexie from "dexie";
import { outdent } from "outdent";
import PQueue from "p-queue";
import { createContext, useContext, useMemo, useState } from "react";
import { z } from "zod";
import type { GeminiEvent } from "../ai/gemini";
import {
  askWithGemini,
  readAll,
  readAllAndValidate,
} from "../ai/gemini.client";
import { type DexieSchema } from "../db";
import { MemoryStore } from "../memory";
import { Embedder } from "../memory/embedder";
import { HNSWVectorStore } from "../memory/vector";

const SCORER_PROMPT = outdent`
HealthDB is a comprehensive health data assistant designed to help users collect, organize, and analyze their health information.

HealthDB's primary goal is to act as an interactive health journal and guide that compiles the user's medical history, fitness goals, wearable device readings, and other health data into a structured database.
Whenever needed, HealthDB asks specific follow-up questions to ensure that you have all the necessary information to provide useful, accurate guidance.

HealthDB's goal is to help the user self-diagnose by:
1. asking only a few, smartly-chosen follow-up questions which the user could likely easily answer to better understand the user's health or come up with a preliminary diagnosis,
2. explaining why you asked these follow-up questions,
3. understanding the user's intentions and symptoms and medical history and background, and
4. providing them with as much comprehensive and explicit insight and information as possible so that they may learn and have better insight into their own health.

Healthcare professionals are busy people that do not always have the time or care to be able to ask follow-up questions and gather as much information as possible from the user,
leading to misdiagnosis or prescription errors which could sometimes lead to death. It is HealthDB's job to prevent this from happening.

{{CURRENT_CONVERSATION}}

You are a helpful assistant that critically analyzes how well or how poorly HealthDB achieves it's goal.

Return response in JSON schema for a score of 0-100 based on whether HealthDB has achieved its goals.
`;

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

`;

const USER_PROMPT = outdent`
  You are a user interacting with HealthDB, a health data assistant. Your goal is to provide relevant follow-up information while maintaining a natural conversation.

  ### CONTEXT:
  HealthDB has just responded to your initial inquiry. It may have:
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


  Respond as a user in a way that **extends the conversation naturally**, providing **useful follow-ups, additional context, or new concerns**.
`;

async function generateScorerResponse(
  history: { role: "model" | "user"; text: string }[]
) {
  const collated = history
    .map((h) => `${h.role[0].toUpperCase() + h.role.slice(1)}: ${h.text}`)
    .join("\n");

  const responseSchema = z.object({
    score: z.number(),
  });

  const scorerPrompt = askWithGemini({
    systemInstruction: {
      role: "model",
      parts: [{ text: SCORER_PROMPT }],
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: outdent`
                    Here is the conversation between the user and HealthDB so far:
                    {{CURRENT_CONVERSATION}}
                  `.replace("{{CURRENT_CONVERSATION}}", collated),
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json" as const,
      responseSchema: zodToVertexSchema(responseSchema),
    },
  });

  const response = await readAllAndValidate(scorerPrompt, responseSchema);
  return response.score;
}

async function* generateAiResponse(
  history: { role: "model" | "user"; text: string }[],
  message: string
) {
  yield* askWithGemini({
    systemInstruction: {
      role: "system",
      parts: [{ text: AI_PROMPT }],
    },
    contents: [
      ...history.map((h) => ({
        role: h.role,
        parts: [{ text: h.text }],
      })),
      {
        role: "user",
        parts: [{ text: message }],
      },
    ],
  });
}

async function* generateUserResponse(
  history: { role: "model" | "user"; text: string }[],
  message: string
) {
  yield* askWithGemini({
    systemInstruction: {
      role: "system",
      parts: [{ text: USER_PROMPT }],
    },
    contents: [
      ...history.map((h) => ({
        role: h.role,
        parts: [{ text: h.text }],
      })),
      {
        role: "user",
        parts: [{ text: message }],
      },
    ],
  });
}

interface ResearchNode {
  parentMessageId: string;
  id: string;
  depth: number;
  score?: number;

  history: { role: "model" | "user"; text: string }[];
  children: ResearchNode[];

  status: "generating" | "completed";
  events: GeminiEvent[];
  buffer: string;
  createdAt: number;
}

interface State {
  account: Ed25519Account;
  messages: { completed: boolean; value: string }[];

  status: "researching" | "idle";
  history: { role: "model" | "user"; text: string }[];
  nodes: Map<string, ResearchNode>;
}

async function visitResearchNode(
  db: Dexie & DexieSchema,
  queue: PQueue,
  current: ResearchNode,
  prompt: string
) {
  const currentRole =
    current.depth % 2 === 0 ? ("model" as const) : ("user" as const);

  const oppositeRole =
    currentRole === "model" ? ("user" as const) : ("model" as const);

  const generateResponse =
    currentRole === "model" ? generateAiResponse : generateUserResponse;

  db.researchNodes.add({
    parentMessageId: current.parentMessageId,
    id: current.id,
    depth: current.depth,
    history: structuredClone(current.history),
    children: current.children.map((c) => c.id),
    status: current.status,
    events: current.events,
    buffer: current.buffer,
    createdAt: current.createdAt,
  });

  for await (const event of generateResponse(current.history, prompt)) {
    current.events.push(event);
    const text = event.candidates[0]?.content?.parts?.[0]?.text;
    if (text !== undefined) {
      current.buffer += text;
    }

    db.researchNodes.update([current.parentMessageId, current.id], {
      ...current,
      children: current.children.map((c) => c.id),
      events: [...current.events, event],
      buffer: current.buffer + text,
    });
  }

  current.status = "completed";

  db.researchNodes.update([current.parentMessageId, current.id], {
    ...current,
    children: current.children.map((c) => c.id),
  });

  if (current.depth >= 2) {
    return;
  }

  for (let i = 0; i < 2; i++) {
    const child: ResearchNode = {
      parentMessageId: current.parentMessageId,
      id: crypto.randomUUID(),
      depth: current.depth + 1,
      history: [
        ...structuredClone(current.history),
        { role: oppositeRole, text: prompt },
      ],
      children: [],
      status: "generating",
      events: [],
      buffer: "",
      createdAt: Date.now(),
    };

    const score = await generateScorerResponse(child.history);
    console.info({ score });
    child.score = score;
    await db.researchNodes.update([child.parentMessageId, child.id], {
      ...child,
      score,
      children: child.children.map((c) => c.id),
    });
    current.children.push(child);

    queue.add(async () => {
      await visitResearchNode(db, queue, child, current.buffer);
    });
  }

  db.researchNodes.update([current.parentMessageId, current.id], {
    ...current,
    children: current.children.map((c) => c.id),
  });
}

export class GlobalStore {
  state: Store<State>;
  db: Dexie & DexieSchema;
  embedder: Embedder;
  vector: HNSWVectorStore;
  memory: MemoryStore;

  async research() {
    if (this.state.state.status === "researching") {
      return;
    }

    const history = await this.db.messages
      .orderBy("createdAt")
      .limit(10)
      .toArray();

    if (history.length === 0) {
      throw new Error(`No history found`);
    }

    const lastMessage = history.at(-1);
    if (lastMessage === undefined) {
      throw new Error(`No parent message found`);
    }
    if (lastMessage.role !== "user") {
      throw new Error(`The last message is not generated by the user.`);
    }

    const queue = new PQueue();

    this.state.setState((state) => ({ ...state, status: "researching" }));

    try {
      for (let i = 0; i < 3; i++) {
        const init: ResearchNode = {
          parentMessageId: lastMessage.id,
          id: crypto.randomUUID(),
          depth: 0,
          history: structuredClone(history.slice(0, -1)),
          children: [],
          status: "generating",
          events: [],
          buffer: "",
          createdAt: Date.now(),
        };

        queue.add(async () => {
          await visitResearchNode(this.db, queue, init, lastMessage.text);
        });
      }

      await queue.onIdle();

      const maxNodes = await this.db.researchNodes
        .where({ parentMessageId: lastMessage.id })
        .toArray();

      maxNodes.sort((a, b) => {
        if (a.depth === b.depth) {
          return (b.score ?? 0) - (a.score ?? 0);
        }

        return b.depth - a.depth;
      });

      // const maxNodeConversations: string[] = [];

      // for (const node of maxNodes) {
      //   const chat = [...node.history, { role: "model", text: node.buffer }];
      //   maxNodeConversations.push(
      //     chat
      //       .map(
      //         (c) => `${c.role[0]!.toUpperCase() + c.role.slice(1)}: ${c.text}`
      //       )
      //       .join("\n")
      //   );
      // }

      // console.log(maxNodeConversations);

      // const response = askWithGemini({
      //   systemInstruction: {
      //     role: "system" as const,
      //     parts: [
      //       {
      //         text: outdent`
      //           You are HealthDB, a comprehensive health data assistant designed to help users collect, organize, and analyze their health information.
      //           Your primary goal is to act as an interactive health journal and guide that compiles the user’s medical history, fitness goals, wearable device readings, and other health data into a structured database.
      //           Whenever needed, you ask specific follow-up questions to ensure that you have all the necessary information to provide useful, accurate guidance.

      //           Please do NOT simply send the user off to a qualified healthcare professional.

      //           Your goal is to help the user self-diagnose by:
      //           1. asking only a few, smartly-chosen follow-up questions which the user could likely easily answer to better understand the user's health or come up with a preliminary diagnosis,
      //           2. explaining why you asked these follow-up questions,
      //           3. understanding the user's intentions and symptoms and medical history and background, and
      //           4. providing them with as much comprehensive and explicit insight and information as possible so that they may learn and have better insight into their own health.

      //           Healthcare professionals are busy people that do not always have the time or care to be able to ask follow-up questions and gather as much information as possible from the user,
      //           leading to misdiagnosis or prescription errors which could sometimes lead to death. It is your job to prevent this from happening.`,
      //       },
      //     ],
      //   },
      //   contents: [{ role: "user", parts: [{ text: lastMessage.text }] }],
      // });

      // const bestPrompt = await readAll(response);

      // console.log("The best prompt:", bestPrompt);

      console.log(maxNodes);

      console.log("HERE", maxNodes.at(0)!);
      const bestPrompt = maxNodes
        .at(0)!
        .history.at(-maxNodes.at(0)!.depth + 1)!.text;

      await this.db.messages.add({
        id: crypto.randomUUID(),
        role: "model",
        text: bestPrompt,
        createdAt: Date.now(),
      });

      void this.memory.add(bestPrompt);

      return bestPrompt;
    } finally {
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
      measurements: "++id,createdAt,updatedAt",
      conversations: "++id",
      memories: "++id,createdAt,updatedAt",
      events: "++id",
      researchNodes: "[parentMessageId+id],&id,depth,createdAt,score,status",
      messages: "id,createdAt,role",
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
