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

function ResearchPanel() {
  const db = useDexie();
  const nodeIds = useLiveQuery(async () => {
    const collection = db.researchNodes.toCollection();

    return await collection.primaryKeys();
  });

  return (
    <div>
      {(nodeIds ?? []).map((id) => (
        <ResearchNodePanel key={id} nodeId={id} />
      ))}
    </div>
  );
}

function ResearchNodePanel({ nodeId }: { nodeId: string }) {
  const db = useDexie();
  const node = useLiveQuery(async () => {
    return db.researchNodes.get(nodeId);
  });

  if (node === undefined) {
    return <div>Node {nodeId} not found</div>;
  }

  return (
    <div>
      <code>
        {node.id} ({node.depth}) ({node.status})
      </code>
      <Markdown>{node.buffer}</Markdown>
    </div>
  );
}

function Home() {
  const account = useGlobalStore((state) => state.account);
  const memory = useMemoryStore();
  const store = useGlobals();

  return (
    <div className="h-dvh w-full bg-gray-50 flex flex-col">
      <div className="p-4 grow">
        <div>Hello world</div>
        <div className="grid gap-2">
          <LogoutPanel />
          <button
            className="cursor-pointer bg-gray-300 rounded-md px-2 py-1"
            onClick={async () => {
              const response = await fetch("/ask", {
                method: "POST",
                body: JSON.stringify({
                  contents: [
                    { role: "user", parts: [{ text: "Hi! How are you?" }] },
                  ],
                } satisfies AskWithGeminiBody),
              });

              // @ts-expect-error - This is a valid async generator function
              for await (const event of response.body.pipeThrough(
                new TextDecoderStream("utf-8", { fatal: true }),
              )) {
                console.log(event);
              }
            }}
          >
            stream example prompt
          </button>
          <button
            className="cursor-pointer bg-gray-300 rounded-md px-2 py-1"
            onClick={async () => {
              memory?.add("hello i love chocolate");
            }}
          >
            add memory example
          </button>
          <button
            className="cursor-pointer bg-gray-300 rounded-md px-2 py-1"
            onClick={async () => {
              const memories = await memory?.list();
              console.info(memories);
            }}
          >
            list memories
          </button>
          <button
            className="cursor-pointer bg-gray-300 rounded-md px-2 py-1"
            onClick={async () => {
              await store.askAndSaveToMemory(
                "I drank too much hot chocolate, now my blood sugar is feeling high, i feel sick",
              );
            }}
          >
            Test messageitem
          </button>
          <button
            className="cursor-pointer bg-gray-300 rounded-md px-2 py-1"
            onClick={async () => {
              const results = await memory.search("hot chocolate");
              console.info(results);
            }}
          >
            Search for results
          </button>
          <button
            className="cursor-pointer bg-gray-300 rounded-md px-2 py-1"
            onClick={async () => {
              const response = await fetch("/tokens", {
                method: "POST",
                body: JSON.stringify({
                  contents: [
                    { role: "user", parts: [{ text: "Hi! How are you?" }] },
                  ],
                } satisfies AskWithGeminiBody),
              });

              const result: GeminiCountTokensResponse = await response.json();

              console.log(result);
            }}
          >
            count tokens
          </button>
          <button
            className="cursor-pointer bg-gray-300 rounded-md px-2 py-1"
            onClick={async () => {
              const serializer = new Serializer();
              new FixedBytes(ABI.address).serialize(serializer);
              new MoveString("token").serialize(serializer);
              new MoveString("ReceiptBody").serialize(serializer);
              account.accountAddress.serialize(serializer);
              new FixedBytes(HEALTH_AI_AGENT_CREATOR_ADDRESS).serialize(
                serializer,
              );
              new U64(10_000_000_000n).serialize(serializer);

              const signature = account.sign(serializer.toUint8Array());
              console.log(signature.toString());
            }}
          >
            sign message
          </button>

          <button
            className="cursor-pointer bg-gray-300 rounded-md px-2 py-1"
            onClick={async () => {
              const PROMPT = outdent`
                I have a heart pressure monitor. I did two readings. It's 1:05AM.

                First reading: sys. 111, dia. 68, pulse 76.
                Second reading: sys. 114, dia. 66, pulse 74.

                Weight is 88kg. I am male. 27 years old.

                Indicate to me if these readings indicate any potential health concerns and if there is anything I can or should do about it.

                I run 5km every day or two. It takes me on average 34 minutes to complete a 5k.
              `;

              const node = await store.research(PROMPT);
              console.info(node);
            }}
          >
            do da research
          </button>
        </div>

        <div>
          <ResearchPanel />
        </div>
      </div>
      <div className="p-4">
        <textarea
          className="p-6 rounded-md bg-gray-200 w-full field-sizing-content"
          rows={4}
          placeholder="What's on your mind?"
        />
      </div>
    </div>
  );
}

export default App;
