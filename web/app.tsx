import { FixedBytes, MoveString, Serializer, U64 } from "@aptos-labs/ts-sdk";
import {
  keepPreviousData,
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { Decimal } from "decimal.js";
import { useState } from "react";
import type {
  AskWithGeminiBody,
  GeminiCountTokensResponse,
} from "../ai/gemini";
import { ABI } from "../move/abi";
import { aptos } from "../move/aptos";
import {
  HEALTH_AI_AGENT_CREATOR_ADDRESS,
  HEALTH_TOKEN_ADDRESS,
} from "./globals";
import {
  GlobalStoreProvider,
  useDexie,
  useGlobalStore,
  useMemoryStore,
} from "./store";
import { useLiveQuery } from "dexie-react-hooks";

import { outdent } from "outdent";
import Markdown from "react-markdown";
import { useGlobals } from "./store";
import { motion } from "motion/react";

function App() {
  const [queryClient] = useState(new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <GlobalStoreProvider>
        <Home />
      </GlobalStoreProvider>
    </QueryClientProvider>
  );
}

const tokenFormatter = new Intl.NumberFormat("en-US", {
  style: "decimal",
  maximumFractionDigits: 9,
  minimumFractionDigits: 2,
});

function LogoutPanel() {
  const account = useGlobalStore((state) => state.account);

  const query = useQuery({
    queryKey: ["coins"],
    queryFn: async () => {
      const response = await aptos.getCurrentFungibleAssetBalances({
        options: {
          where: {
            owner_address: {
              _eq: account.accountAddress.toString(),
            },
          },
        },
      });

      for (const balance of response) {
        if (
          balance.asset_type === HEALTH_TOKEN_ADDRESS &&
          balance.amount !== undefined
        ) {
          return BigInt(balance.amount);
        }
      }

      return 0n;
    },
    placeholderData: keepPreviousData,
    select: (data) =>
      tokenFormatter.format(new Decimal(data.toString()).div(1e9).toNumber()),
  });

  return (
    <>
      <div>
        <span>You are logged in as: {account.accountAddress.toString()}</span>
      </div>
      <div>
        <span>Your Ed25519 public key is: {account.publicKey.toString()}</span>
      </div>
      <div>
        {!query.isLoading && <span>You have {query.data} HEALTH token(s)</span>}
        {query.isLoading && <span>Loading...</span>}
      </div>
      <div>
        <a
          href={`https://aptos.dev/en/network/faucet?address=${account.accountAddress.toString()}`}
          target="_blank"
          className="cursor-pointer bg-gray-300 rounded-md px-2 py-1"
        >
          Get testnet tokens
        </a>
      </div>
    </>
  );
}

function ResearchPanel({ messageId }: { messageId: string }) {
  const db = useDexie();
  const nodeIds = useLiveQuery(async () => {
    const collection = db.researchNodes.where({ parentMessageId: messageId });

    return (await collection.primaryKeys()) as [messageId: string, id: string];
  });

  console.log(nodeIds);

  return (
    <div>
      {(nodeIds ?? []).map(([, id]) => (
        <ResearchNodePanel key={id} messageId={messageId} nodeId={id} />
      ))}
    </div>
  );
}

function ResearchNodePanel({
  messageId,
  nodeId,
}: {
  messageId: string;
  nodeId: string;
}) {
  const db = useDexie();
  const node = useLiveQuery(async () => {
    return db.researchNodes.get({ parentMessageId: messageId, id: nodeId });
  });

  if (node === undefined) {
    return <div>Node {nodeId} not found</div>;
  }

  return (
    <div>
      <code>
        {node.id} ({node.depth}) ({node.status}) (Score: {node.score})
      </code>
      <Markdown>{node.buffer}</Markdown>
    </div>
  );
}

function ChatHistoryList() {
  const db = useDexie();
  const messages = useLiveQuery(async () => {
    return db.messages.orderBy("createdAt").reverse().toArray();
  });

  return (
    <div className="flex flex-col-reverse gap-6">
      {(messages ?? []).map((message) => (
        <ChatMessage key={message.id} messageId={message.id} />
        // <ResearchPanel messageId={message.id} />
      ))}
    </div>
  );
}

function ChatMessage({ messageId }: { messageId: string }) {
  const db = useDexie();
  const message = useLiveQuery(async () => {
    return db.messages.get(messageId);
  });

  console.log(messageId);

  if (message === undefined) {
    return <div>Message {messageId} not found</div>;
  }

  return (
    <div
      className={`w-1/2 bg-zinc-200 rounded-md p-3 ${
        message.role === "model" ? "self-start ml-4 mt-4" : "self-end mr-4 mt-4"
      }`}
    >
      <Markdown>{message.text}</Markdown>
    </div>
  );
}

function Home() {
  const db = useDexie();
  const account = useGlobalStore((state) => state.account);
  const memory = useMemoryStore();
  const store = useGlobals();
  const status = useGlobalStore((state) => state.status);

  const [value, setValue] = useState("");

  return (
    <div className="h-dvh max-h-dvh w-full bg-gray-50 flex flex-col">
      <div className="p-4">
        <h1 className="text-xl font-semibold">HealthDB</h1>
      </div>
      <div className="grow flex-1 min-h-0 overflow-y-auto">
        <ChatHistoryList />
      </div>
      <motion.div className="pt-4">
        <motion.div whileHover={{ padding: 0 }} className="p-4">
          <div className="bg-gray-200 w-full rounded-md p-6 flex gap-3">
            <motion.textarea
              className="p-6 rounded-md bg-gray-200 w-full field-sizing-content resize-none outline-none"
              rows={8}
              placeholder="What's on your mind?"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />

            <button
              disabled={value.trim().length === 0 || status === "researching"}
              className="bg-blue-500 text-white px-3 py-1 text-xl rounded-md cursor-pointer disabled:cursor-not-allowed"
              onClick={async (e) => {
                e.preventDefault();

                const text = value.trim();

                setValue("");

                await db.messages.add({
                  id: crypto.randomUUID(),
                  role: "user",
                  text,
                  createdAt: Date.now(),
                });

                await store.research();
              }}
            >
              {status === "researching" ? "Thinking..." : "Send"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

export default App;
