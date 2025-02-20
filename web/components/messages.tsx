import { useMemo } from "react";
import { useGlobalStore } from "../store";
import Markdown from "react-markdown";

const MessageItem = ({ messageId }: { messageId: string }) => {
  const prompt = useGlobalStore((store) => store.messages.get(messageId));

  return (
    <>
      <Markdown className="bg-gray-300">
        {messageId + (prompt?.value ?? "")}
      </Markdown>
      {JSON.stringify(prompt?.completed)}
    </>
  );
};

export const MessageList = () => {
  const messages = useGlobalStore((store) => store.messages);
  const keys = useMemo(() => Array.from(messages.keys()), [messages]);

  return (
    <div className="flex flex-wrap gap-4">
      {keys.map((key) => (
        <MessageItem key={key} messageId={key} />
      ))}
    </div>
  );
};
