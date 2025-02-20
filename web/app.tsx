import { FixedBytes, MoveString, Serializer, U64 } from "@aptos-labs/ts-sdk";
import {
  keepPreviousData,
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { Decimal } from "decimal.js";
import { Fragment, useState } from "react";
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
import { Drawer } from "vaul";

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
    <div className="grid grid-cols-3 gap-4 p-4">
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
    <div
      className={`rounded-md  ${
        node.status === "completed"
          ? "bg-green-200"
          : "bg-zinc-100 animate-pulse"
      } text-sm`}
    >
      <div className="p-4">
        <div className="flex gap-2 line-clamp-1">
          <span className="font-bold line-clamp-1">MCTS Node</span>{" "}
          <span className="line-clamp-1">{node.id}</span>
        </div>
        <div>
          <code>
            (Depth {node.depth + 1}) (Score: {node.score ?? 0})
          </code>
        </div>
      </div>
      <Markdown className="max-h-48 overflow-y-auto p-4">
        {node.buffer}
      </Markdown>
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
        <Fragment key={message.id}>
          <ResearchPanel messageId={message.id} />
          <ChatMessage key={message.id} messageId={message.id} />
        </Fragment>
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
      className={`w-[80%] bg-zinc-200 rounded-md p-3 ${
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

  const [value, setValue] = useState("");

  return (
    <div className="h-dvh max-h-dvh w-full bg-gray-50 flex flex-col">
      <div className="p-4 flex justify-between items-center">
        <h1 className="text-xl font-semibold">HealthDB</h1>
        <div>
          <button
            className={`cursor-pointer bg-gray-300 rounded-md px-2 py-1 text-sm ${
              query.isLoading ? "animate-pulse" : ""
            }`}
            onClick={async () => {
              const serializer = new Serializer();
              new FixedBytes(ABI.address).serialize(serializer);
              new MoveString("token").serialize(serializer);
              new MoveString("ReceiptBody").serialize(serializer);
              account.accountAddress.serialize(serializer);
              new FixedBytes(HEALTH_AI_AGENT_CREATOR_ADDRESS).serialize(
                serializer
              );
              new U64(10_000_000_000n).serialize(serializer);

              const signature = account.sign(serializer.toUint8Array());
              console.log(signature.toString());
            }}
          >
            {query.isLoading ? "Loading..." : `${query.data} $HEALTH`}
          </button>
        </div>
      </div>
      <div className="grow flex-1 min-h-0 overflow-y-auto">
        <ChatHistoryList />
      </div>
      <motion.div className="pt-4">
        <motion.div whileHover={{ padding: 0 }} className="p-4">
          <div className="bg-gray-200 w-full rounded-md p-6 flex gap-3 items-center">
            <motion.textarea
              className="p-6 rounded-md bg-gray-200 w-full field-sizing-content resize-none outline-none"
              rows={8}
              placeholder="What's on your mind?"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />

            <motion.button
              whileHover={{ scale: 1.05 }}
              disabled={value.trim().length === 0 || status === "researching"}
              className="bg-blue-500 text-white p-4 text-xl rounded-md cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
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
            </motion.button>

            <MeasurementDrawer />

            <MemoriesDrawer />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

function MemoriesDrawer() {
  const db = useDexie();

  const memories = useLiveQuery(async () => {
    return db.memories.orderBy("createdAt").reverse().toArray();
  });

  console.log(memories);

  return (
    <Drawer.Root>
      <Drawer.Trigger asChild>
        <motion.button
          whileHover={{ scale: 1.05 }}
          className="bg-blue-200 text-black p-4 text-xl rounded-md cursor-pointer"
        >
          Memories
        </motion.button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40" />
        <Drawer.Content className="bg-zinc-100 flex flex-col rounded-t-[10px] h-[60%] mt-24 fixed bottom-0 left-0 right-0">
          <div className="p-4 bg-white rounded-t-[10px] flex-1">
            <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-zinc-300 mb-8" />
            <div className="mx-auto">
              <Drawer.Title className="font-medium mb-4">
                Your memories
              </Drawer.Title>

              <div className="space-y-6 overflow-y-auto">
                <div className="grid grid-cols-2 bg-slate-200 rounded-md border divide-y">
                  <div className="col-span-full grid grid-cols-subgrid divide-x text-xs font-semibold">
                    <div className="px-2 py-1">Recorded At</div>
                    <div className="px-2 py-1">Fact</div>
                  </div>

                  {(memories ?? []).map((memory, i) => {
                    return (
                      <div
                        key={i}
                        className="col-span-full grid grid-cols-subgrid divide-x text-sm"
                      >
                        <div className="px-2 py-1">
                          {new Date(memory.createdAt).toLocaleString()}
                        </div>
                        <div className="px-2 py-1">{memory.content}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function MeasurementDrawer() {
  const db = useDexie();

  const measurements = useLiveQuery(async () => {
    return db.measurements.orderBy("createdAt").reverse().toArray();
  });

  return (
    <Drawer.Root>
      <Drawer.Trigger asChild>
        <motion.button
          whileHover={{ scale: 1.05 }}
          className="bg-white text-black p-4 text-xl rounded-md cursor-pointer"
        >
          Measurements
        </motion.button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40" />
        <Drawer.Content className="bg-zinc-100 flex flex-col rounded-t-[10px] h-[60%] mt-24 fixed bottom-0 left-0 right-0">
          <div className="p-4 bg-white rounded-t-[10px] flex-1">
            <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-zinc-300 mb-8" />
            <div className="mx-auto">
              <Drawer.Title className="font-medium mb-4">
                Your measurements
              </Drawer.Title>

              <div className="space-y-6 overflow-y-auto">
                <div className="grid grid-cols-5 bg-slate-200 rounded-md border divide-y">
                  <div className="col-span-full grid grid-cols-subgrid divide-x text-xs font-semibold">
                    <div className="px-2 py-1">Recorded At</div>
                    <div className="px-2 py-1">Type</div>
                    <div className="px-2 py-1">Unit</div>
                    <div className="px-2 py-1">Value</div>
                  </div>

                  {(measurements ?? []).map((measurement, i) => {
                    return (
                      <div
                        key={i}
                        className="col-span-full grid grid-cols-subgrid divide-x text-sm"
                      >
                        <div className="px-2 py-1">
                          {new Date(measurement.createdAt).toLocaleString()}
                        </div>
                        <div className="px-2 py-1">{measurement.type}</div>
                        <div className="px-2 py-1">{measurement.unit}</div>
                        <div className="px-2 py-1">{measurement.value}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export default App;
