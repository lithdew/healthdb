import { useEffect, useState } from "react";
import type { GeminiEvent } from "../../ai/gemini";
import Markdown from "react-markdown";
import { useDexie } from "../store";

export const MessageItem = ({
  stream,
}: {
  stream: AsyncGenerator<GeminiEvent, void, unknown> | null;
}) => {
  const [value, setValue] = useState("");
  const [completed, setCompleted] = useState(false);
  const dexie = useDexie();

  useEffect(() => {
    async function startStream() {
      setValue("");
      setCompleted(false);
      if (stream === null) return;

      let content = "";

      for await (const chunk of stream) {
        const text = chunk.candidates[0]?.content?.parts[0]?.text ?? "";
        setValue((prev) => prev + text);
        content += text;
      }

      setCompleted(true);
      dexie.conversations.add({ content, createdAt: Date.now() });
    }
    startStream();
  }, [stream, dexie]);

  return (
    <div
      className="data-[completed=true]:bg-green-300 text-xs"
      data-completed={completed}
    >
      <Markdown>{value}</Markdown> {JSON.stringify(completed)}
    </div>
  );
};
