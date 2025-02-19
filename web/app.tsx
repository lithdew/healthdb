import {
  AptosWalletAdapterProvider,
  groupAndSortWallets,
  useWallet,
  WalletItem,
} from "@aptos-labs/wallet-adapter-react";
import { Network } from "@aptos-labs/ts-sdk";
import type { AskWithGeminiBody } from "../ai/gemini";

function App() {
  return (
    <AptosWalletAdapterProvider
      autoConnect
      dappConfig={{
        network: Network.TESTNET,
        aptosApiKeys: {
          testnet: import.meta.env.VITE_APTOS_API_KEY_TESTNET,
        },
        aptosConnect: {
          dappName: "HealthDB",
          dappIcon: `${window.location.origin}/favicon.ico`,
        },
      }}
    >
      <Home />
    </AptosWalletAdapterProvider>
  );
}

function LoginPanel() {
  const { wallet, wallets = [], ...rest } = useWallet();

  console.log({ wallet, wallets, ...rest });

  const { aptosConnectWallets } = groupAndSortWallets(wallets, {});

  return aptosConnectWallets.map((wallet) => {
    return (
      <WalletItem
        key={wallet.name}
        wallet={wallet}
        onConnect={() => {
          console.log("connected");
        }}
      >
        <WalletItem.ConnectButton asChild>
          <button className="cursor-pointer w-full gap-3 flex items-center bg-gray-300 px-3 py-2 rounded-md">
            <WalletItem.Icon className="size-8" />
            <WalletItem.Name className="text-lg font-normal" />
          </button>
        </WalletItem.ConnectButton>
      </WalletItem>
    );
  });
}

function LogoutPanel() {
  const { account, disconnect } = useWallet();

  if (account === null) {
    return null;
  }

  return (
    <>
      <div>
        <span>You are logged in as: {account?.address}</span>
      </div>
      <button
        className="bg-gray-300 px-3 py-2 rounded-md text-lg font-normal"
        onClick={() => {
          disconnect();
        }}
      >
        Logout
      </button>
    </>
  );
}

function Home() {
  const { account, isLoading } = useWallet();
  return (
    <div className="h-dvh w-full bg-gray-50 flex flex-col">
      <div className="p-4 grow">
        <div>Hello world</div>
        <div className="grid gap-2">
          {isLoading ? (
            <div>Loading...</div>
          ) : (
            <>
              {account === null && <LoginPanel />}
              {account !== null && <LogoutPanel />}
            </>
          )}
          <button
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
            fun
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
