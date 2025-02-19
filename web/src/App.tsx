function App() {
  return (
    <div className="h-dvh w-full bg-gray-50 flex flex-col">
      <div className="p-4 grow">Hello world</div>
      <div className="p-4">
        <textarea
          className="p-6 rounded-md bg-gray-200 w-full"
          rows={4}
          placeholder="What's on your mind?"
        />
      </div>
    </div>
  );
}

export default App;
