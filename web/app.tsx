import { FixedBytes, MoveVector, U64 } from "@aptos-labs/ts-sdk";
import type {
  AskWithGeminiBody,
  GeminiCountTokensResponse,
} from "../ai/gemini";
import { GlobalStoreProvider, useGlobalStore, useMemoryStore } from "./store";

function App() {
  return (
    <GlobalStoreProvider>
      <Home />
    </GlobalStoreProvider>
  );
}

function LogoutPanel() {
  const account = useGlobalStore((state) => state.account);

  return (
    <>
      <div>
        <span>You are logged in as: {account.accountAddress.toString()}</span>
      </div>
    </>
  );
}

function Home() {
  const account = useGlobalStore((state) => state.account);
  const memory = useMemoryStore();

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
                new TextDecoderStream("utf-8", { fatal: true })
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
              const message = new MoveVector([
                new FixedBytes("0x1234"),
                new FixedBytes("0x5678"),
                new U64(10_000_000_000),
              ]);

              const signature = account.sign(message.bcsToBytes());
              console.log(signature.toString());
            }}
          >
            sign message
          </button>
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
